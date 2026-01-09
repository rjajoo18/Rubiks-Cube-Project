import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { Solve } from "@/types/api";
import { formatDisplayTime, formatMs } from "@/utils/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type SolveListParams = {
  limit: number;
  cursor?: string;
};

type GroupMode = "none" | "day" | "session";
const SESSION_GAP_MINUTES = 30;

const normalizeSolutionMoves = (moves: unknown): string[] => {
  if (!moves) return [];
  if (Array.isArray(moves)) return moves.filter((m) => typeof m === "string") as string[];
  if (typeof moves === "string") {
    const t = moves.trim();
    if (!t) return [];
    return t.split(/\s+/).filter(Boolean);
  }
  return [];
};

export const HistoryPage: React.FC = () => {
  const [solves, setSolves] = useState<Solve[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [groupMode, setGroupMode] = useState<GroupMode>("day");

  // modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSolve, setSelectedSolve] = useState<Solve | null>(null);

  // edit state (notes + penalty)
  const [editNotes, setEditNotes] = useState("");
  const [editPenalty, setEditPenalty] = useState<"OK" | "+2" | "DNF">("OK");

  // track “dirty” (unsaved) changes
  const [isDirty, setIsDirty] = useState(false);

  // optional hydration / solution
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatDateTime = (dateStr?: string): string => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDayHeader = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatSolutionMoves = (moves: unknown): string => {
    const arr = normalizeSolutionMoves(moves);
    return arr.length ? arr.join(" ") : "";
  };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const formatPct = (x: number | null | undefined) => {
  if (x == null || Number.isNaN(x)) return "—";
  return `${Math.round(clamp01(x) * 100)}%`;
};


  const loadSolves = async (reset: boolean) => {
    if (reset) setInitialLoading(true);
    else setPageLoading(true);

    setError("");

    try {
      const params: SolveListParams = { limit: 50 };
      if (!reset && nextCursor) params.cursor = nextCursor;

      const data = await apiClient.getSolves(params);

      const normalizedItems = (data.items ?? []).map((s: any) => ({
        ...s,
        solutionMoves: normalizeSolutionMoves(s.solutionMoves),
      }));

      if (reset) setSolves(normalizedItems);
      else setSolves((prev) => [...prev, ...normalizedItems]);

      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error("Failed to fetch solves:", err);
      setError("Failed to load solves.");
    } finally {
      setInitialLoading(false);
      setPageLoading(false);
    }
  };

  useEffect(() => {
    void loadSolves(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // group solves (optional)
  const grouped = useMemo(() => {
    if (groupMode === "none") return [{ title: null as string | null, items: solves }];

    if (groupMode === "day") {
      const map = new Map<string, Solve[]>();
      for (const s of solves) {
        const key = new Date(s.createdAt).toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      }

      return Array.from(map.values()).map((items) => ({
        title: formatDayHeader(items[0].createdAt),
        items,
      }));
    }

    // session grouping
    const groups: { title: string; items: Solve[] }[] = [];
    if (solves.length === 0) return groups;

    const mins = SESSION_GAP_MINUTES;
    let current: Solve[] = [solves[0]];

    for (let i = 1; i < solves.length; i++) {
      const prev = solves[i - 1];
      const cur = solves[i];

      const gapMs = Math.abs(new Date(prev.createdAt).getTime() - new Date(cur.createdAt).getTime());
      const gapMin = gapMs / (1000 * 60);

      if (gapMin > mins) {
        groups.push({
          title: `Session • ${formatDateTime(current[current.length - 1].createdAt)} → ${formatDateTime(
            current[0].createdAt
          )}`,
          items: current,
        });
        current = [cur];
      } else {
        current.push(cur);
      }
    }

    groups.push({
      title: `Session • ${formatDateTime(current[current.length - 1].createdAt)} → ${formatDateTime(
        current[0].createdAt
      )}`,
      items: current,
    });

    return groups;
  }, [solves, groupMode]);

  // Save notes + penalty (used by Save button + auto-save on close)
  const persistEdits = async () => {
    if (!selectedSolve) return;

    setSaving(true);
    setError("");

    // optimistic update so UI reflects penalty/notes immediately
    const optimisticPenalty = editPenalty === "OK" ? null : editPenalty;
    const optimistic: Solve = {
      ...selectedSolve,
      notes: editNotes,
      penalty: optimisticPenalty as any,
    };

    setSelectedSolve(optimistic);
    setSolves((prev) => prev.map((s) => (s.id === optimistic.id ? { ...s, ...optimistic } : s)));

    try {
      const res = await apiClient.updateSolve(selectedSolve.id, {
        penalty: optimisticPenalty,
        notes: editNotes,
      });

      const updated = {
        ...res.solve,
        solutionMoves: normalizeSolutionMoves((res.solve as any).solutionMoves),
      } as Solve;

      // keep any existing solutionMoves if backend doesn’t return them
      const keepMoves = normalizeSolutionMoves((selectedSolve as any).solutionMoves);
      const backendMoves = normalizeSolutionMoves((updated as any).solutionMoves);
      const merged: Solve = {
        ...updated,
        solutionMoves: (backendMoves.length ? backendMoves : keepMoves) as any,
      };

      setSelectedSolve(merged);
      setSolves((prev) => prev.map((s) => (s.id === merged.id ? { ...s, ...merged } : s)));
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to update solve:", err);
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const closeSolveModal = async () => {
    // auto-save if user changed anything
    if (isDirty && selectedSolve) {
      await persistEdits();
    }

    setIsModalOpen(false);
    setSelectedSolve(null);
    setEditNotes("");
    setEditPenalty("OK");
    setIsDirty(false);
    setDetailsLoading(false);
    setSolutionLoading(false);
    // keep error visible on page, but clear modal-related spinners
  };

  const openSolveModal = async (solve: Solve) => {
    setError("");
    setIsModalOpen(true);

    const normalizedSolve: Solve = {
      ...solve,
      solutionMoves: normalizeSolutionMoves((solve as any).solutionMoves) as any,
    };

    setSelectedSolve(normalizedSolve);
    setEditNotes(solve.notes || "");
    setEditPenalty(((solve.penalty || "OK") as "OK" | "+2" | "DNF") ?? "OK");
    setIsDirty(false);

    // hydrate details, but DO NOT overwrite existing solutionMoves if backend omits them
    setDetailsLoading(true);
    try {
      const res = await apiClient.getSolve(solve.id);
      const full = res.solve as any;

      const hydrated: Solve = {
        ...full,
        solutionMoves: normalizeSolutionMoves(full.solutionMoves) as any,
      };

      setSelectedSolve((prev) => {
        if (!prev) return hydrated;

        const prevMoves = normalizeSolutionMoves((prev as any).solutionMoves);
        const newMoves = normalizeSolutionMoves((hydrated as any).solutionMoves);

        return {
          ...prev,
          ...hydrated,
          solutionMoves: (newMoves.length ? newMoves : prevMoves) as any,
        };
      });

      // update edit fields to match hydrated values
      setEditNotes(hydrated.notes || "");
      setEditPenalty(((hydrated.penalty || "OK") as "OK" | "+2" | "DNF") ?? "OK");
      setIsDirty(false);

      setSolves((prev) =>
        prev.map((s) => (s.id === hydrated.id ? { ...s, ...hydrated, solutionMoves: hydrated.solutionMoves } : s))
      );
    } catch (err) {
      console.warn("Could not hydrate solve details:", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleScoreSolve = async (id: number) => {
  setError("");
  try {
    const result = await apiClient.scoreSolve(id);

    setSolves((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              mlScore: result.mlScore,
              scoreVersion: result.scoreVersion,
              expectedTimeMs: result.expectedTimeMs,
              dnfRisk: result.dnfRisk,
              plus2Risk: result.plus2Risk,
            }
          : s
      )
    );

    setSelectedSolve((prev) =>
      prev && prev.id === id
        ? {
            ...prev,
            mlScore: result.mlScore,
            scoreVersion: result.scoreVersion,
            expectedTimeMs: result.expectedTimeMs,
            dnfRisk: result.dnfRisk,
            plus2Risk: result.plus2Risk,
          }
        : prev
    );
  } catch (err) {
    console.error("Failed to score solve:", err);
    setError("Failed to score solve.");
  }
};


  const handleDeleteSolve = async (id: number) => {
    const ok = window.confirm("Delete this solve? This cannot be undone.");
    if (!ok) return;

    setError("");
    try {
      await apiClient.deleteSolve(id);
      setSolves((prev) => prev.filter((s) => s.id !== id));
      setIsModalOpen(false);
      setSelectedSolve(null);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to delete solve:", err);
      setError("Failed to delete solve.");
    }
  };

  const handleRevealOptimalSolution = async () => {
    if (!selectedSolve) return;

    const state = (selectedSolve as any).state as string | undefined;
    if (!state || state.length !== 54) {
      setError("This solve is missing a 54-character cube state, so optimal solution can't be computed.");
      return;
    }

    const ok = window.confirm("Reveal the optimal (Kociemba) solution? This will spoil the solve.");
    if (!ok) return;

    setSolutionLoading(true);
    setError("");

    try {
      const res = await apiClient.getOptimalSolution({ state, event: "3x3" });
      const normalized = normalizeSolutionMoves((res as any).solutionMoves);

      // optimistic set in modal + list
      setSelectedSolve((prev) => (prev ? ({ ...prev, solutionMoves: normalized as any } as Solve) : prev));
      setSolves((prev) => prev.map((s) => (s.id === selectedSolve.id ? { ...s, solutionMoves: normalized as any } : s)));

      // optional persist; if backend doesn't support, we still keep it in UI
      try {
        await apiClient.updateSolve(selectedSolve.id, {
          // @ts-expect-error backend may not support this field
          solutionMoves: normalized,
        });
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("Failed to compute optimal solution:", err);
      setError("Failed to compute optimal solution.");
    } finally {
      setSolutionLoading(false);
    }
  };

  if (initialLoading && solves.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="space-y-6 animate-fade-in">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">History</h1>
              <p className="text-muted-foreground">Your solving journey</p>
            </div>
            <Card className="border border-border/50">
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6 animate-fade-in">
          <div className="mb-4">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">History</h1>
            <p className="text-muted-foreground">
              {solves.length} {solves.length === 1 ? "solve" : "solves"} loaded
            </p>
          </div>

          <Card className="border border-border/50 bg-card/60 backdrop-blur">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Group by</span>
                <div className="flex gap-2">
                  <Button variant={groupMode === "day" ? "primary" : "ghost"} onClick={() => setGroupMode("day")} className="h-9">
                    Day
                  </Button>
                  <Button variant={groupMode === "session" ? "primary" : "ghost"} onClick={() => setGroupMode("session")} className="h-9">
                    Session
                  </Button>
                  <Button variant={groupMode === "none" ? "primary" : "ghost"} onClick={() => setGroupMode("none")} className="h-9">
                    None
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => void loadSolves(true)} disabled={initialLoading || pageLoading}>
                  {initialLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          </Card>

          {error && (
            <Card className="bg-destructive/10 border-destructive/40 border">
              <p className="text-destructive">{error}</p>
            </Card>
          )}

          {solves.length === 0 ? (
            <Card className="text-center py-16 border border-border/50 bg-card/60 backdrop-blur">
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">No solves yet</h2>
                <p className="text-muted-foreground">Go rip some solves on the Timer page.</p>
              </div>
            </Card>
          ) : (
            <>
              <div className="space-y-6">
                {grouped.map((group, gi) => (
                  <div key={`${group.title ?? "none"}-${gi}`} className="space-y-3">
                    {group.title && (
                      <div className="flex items-center justify-between">
                        <h3 className="text-base md:text-lg font-semibold">{group.title}</h3>
                        <span className="text-xs text-muted-foreground">{group.items.length} solves</span>
                      </div>
                    )}

                    <div className="space-y-4">
                      {group.items.map((solve) => (
                        <Card
                          key={solve.id}
                          hover
                          className="cursor-pointer border border-border/50 bg-card/60 backdrop-blur"
                          onClick={() => void openSolveModal(solve)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="hidden sm:block w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex-shrink-0" />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant="info">{formatDisplayTime(solve.timeMs ?? 0, solve.penalty)}</Badge>
                                <Badge variant="default">{solve.source}</Badge>
                                  {solve.mlScore !== null && solve.mlScore !== undefined && (
                                    <Badge variant="success">Score: {solve.mlScore.toFixed(2)}</Badge>
                                  )}
                                  {solve.expectedTimeMs != null && (
                                    <Badge variant="info">Pred: {formatMs(solve.expectedTimeMs)}</Badge>
                                  )}
                                  {solve.dnfRisk != null && (
                                    <Badge variant="default">DNF {formatPct(solve.dnfRisk)}</Badge>
                                  )}
                                  {solve.plus2Risk != null && (
                                    <Badge variant="default">+2 {formatPct(solve.plus2Risk)}</Badge>
                                  )}
                                {solve.numMoves != null && <Badge variant="info">{solve.numMoves} moves</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">{formatDateTime(solve.createdAt)}</p>
                              <p className="text-sm text-muted-foreground/70 truncate">{solve.scramble ?? "—"}</p>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {nextCursor && (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={() => void loadSolves(false)} disabled={pageLoading || initialLoading}>
                    {pageLoading ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => void closeSolveModal()} title="Solve">
        {selectedSolve && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Time</p>
                {/* ✅ Preview penalty with editPenalty */}
                <Badge variant="info">{formatDisplayTime(selectedSolve.timeMs ?? 0, editPenalty === "OK" ? null : editPenalty)}</Badge>
              </div>

              <div className="space-y-1 text-right">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="text-sm text-foreground">{formatDateTime(selectedSolve.createdAt)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedSolve.mlScore !== null && selectedSolve.mlScore !== undefined ? (
                <Badge variant="success">Score: {selectedSolve.mlScore.toFixed(2)}</Badge>
              ) : (
                <Button variant="secondary" onClick={() => void handleScoreSolve(selectedSolve.id)} className="h-9">
                  Score This Solve
                </Button>
              )}
              {selectedSolve.mlScore != null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  <Card className="border border-border/50 bg-card/40 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Expected Time</p>
                    <p className="text-base font-semibold">
                      {selectedSolve.expectedTimeMs != null ? formatMs(selectedSolve.expectedTimeMs) : "—"}
                    </p>
                  </Card>

                  <Card className="border border-border/50 bg-card/40 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Model Version</p>
                    <p className="text-base font-semibold">{selectedSolve.scoreVersion ?? "—"}</p>
                  </Card>

                  <Card className="border border-border/50 bg-card/40 p-4">
                    <p className="text-xs text-muted-foreground mb-1">DNF Risk</p>
                    <p className="text-base font-semibold">{formatPct(selectedSolve.dnfRisk)}</p>
                  </Card>

                  <Card className="border border-border/50 bg-card/40 p-4">
                    <p className="text-xs text-muted-foreground mb-1">+2 Risk</p>
                    <p className="text-base font-semibold">{formatPct(selectedSolve.plus2Risk)}</p>
                  </Card>
                </div>
              )}

              {detailsLoading && <span className="text-xs text-muted-foreground">Loading details…</span>}
              {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
              {isDirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Scramble</p>
              <code className="text-sm text-foreground font-mono break-all bg-muted/50 px-3 py-2 rounded-lg block">
                {selectedSolve.scramble ?? "—"}
              </code>
            </div>

            <div>
              <Input
                label="Notes"
                multiline
                rows={4}
                value={editNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  setEditNotes(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Add notes..."
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Penalty</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={editPenalty === "OK" ? "primary" : "ghost"}
                  onClick={() => {
                    setEditPenalty("OK");
                    setIsDirty(true);
                  }}
                  className="h-9"
                >
                  OK
                </Button>
                <Button
                  variant={editPenalty === "+2" ? "primary" : "ghost"}
                  onClick={() => {
                    setEditPenalty("+2");
                    setIsDirty(true);
                  }}
                  className="h-9"
                >
                  +2
                </Button>
                <Button
                  variant={editPenalty === "DNF" ? "primary" : "ghost"}
                  onClick={() => {
                    setEditPenalty("DNF");
                    setIsDirty(true);
                  }}
                  className="h-9"
                >
                  DNF
                </Button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => void handleRevealOptimalSolution()} disabled={solutionLoading} className="h-9">
                {solutionLoading ? "Computing..." : "Reveal Optimal Solution"}
              </Button>

              <Button variant="ghost" onClick={() => void handleDeleteSolve(selectedSolve.id)} className="h-9 text-red-400 hover:text-red-300">
                Delete
              </Button>
            </div>

            {normalizeSolutionMoves((selectedSolve as any).solutionMoves).length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Optimal Solution</p>
                <code className="text-sm text-foreground font-mono break-all bg-muted/50 px-3 py-2 rounded-lg block">
                  {formatSolutionMoves((selectedSolve as any).solutionMoves)}
                </code>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-border/50">
              <Button
                variant="primary"
                onClick={() => void persistEdits()}
                className="flex-1"
                disabled={saving || !isDirty}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={() => void closeSolveModal()} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default HistoryPage;
