import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatDisplayTime, formatMs } from '@/utils/time';

type FriendRow = { id: number; name?: string | null; email?: string | null };

type IncomingFriendRequest = {
  id: number;
  status: string;
  createdAt: string | null;
  respondedAt: string | null;
  fromUser: { id: number; name?: string | null; email?: string | null };
};

type OutgoingFriendRequest = {
  id: number;
  status: string;
  createdAt: string | null;
  respondedAt: string | null;
  toUser: { id: number; name?: string | null; email?: string | null };
};

type FriendSummaryResponse = {
  user: { id: number; name?: string | null; email?: string | null };
  stats: {
    count: number | null;
    bestMs: number | null;
    ao5Ms: number | null;
    ao12Ms: number | null;
    avgMs: number | null;
    avgScore: number | null;
  };
  recentSolves: Array<{
    id: number;
    timeMs: number | null;
    penalty: string | null;
    effectiveTimeMs: number | null;
    mlScore: number | null;
    createdAt: string | null;
  }>;
};


function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function shortName(name?: string | null, email?: string | null) {
  const n = (name || '').trim();
  if (n) return n;
  const e = (email || '').trim();
  if (e) return e.split('@')[0] || 'Unknown';
  return 'Unknown';
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: 'blue' | 'green' | 'default';
}) {
  const ring =
    accent === 'blue'
      ? 'border-blue-500/30 bg-blue-500/5'
      : accent === 'green'
      ? 'border-emerald-500/25 bg-emerald-500/5'
      : 'border-border/50 bg-background/20';

  return (
    <div className={cx('rounded-2xl border p-4', ring)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

const FriendsPage: React.FC = () => {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingFriendRequest[]>([]);

  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [summary, setSummary] = useState<FriendSummaryResponse | null>(null);

  const [addEmail, setAddEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [mutating, setMutating] = useState<string | null>(null);

  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<string>('');

  const selectedFriend = useMemo(
    () => friends.find((f) => f.id === selectedFriendId) || null,
    [friends, selectedFriendId]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
        apiClient.getFriends(),
        apiClient.getIncomingFriendRequests(),
        apiClient.getOutgoingFriendRequests(),
      ]);

      const fItems = friendsRes.items || [];
      setFriends(fItems);
      setIncoming(incomingRes.items || []);
      setOutgoing(outgoingRes.items || []);

      setSelectedFriendId((prev) => {
        if (prev != null && fItems.some((x) => x.id === prev)) return prev;
        return fItems.length ? fItems[0].id : null;
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load friends.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (friendId: number) => {
    setError('');
    setDetailLoading(true);
    try {
      const res = await apiClient.getFriendSummary(friendId);
      setSummary(res);
    } catch (e: any) {
      setSummary(null);
      setError(e?.response?.data?.error || e?.message || 'Failed to load friend summary.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedFriendId == null) {
      setSummary(null);
      return;
    }
    void loadSummary(selectedFriendId);
  }, [selectedFriendId, loadSummary]);

  const sendRequest = useCallback(async () => {
    const email = addEmail.trim().toLowerCase();
    if (!email) {
      showToast('Enter an email.');
      return;
    }

    setMutating('send');
    setError('');
    try {
      await apiClient.sendFriendRequest(email);
      setAddEmail('');
      showToast('Request sent.');
      await loadAll();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to send request.');
    } finally {
      setMutating(null);
    }
  }, [addEmail, loadAll, showToast]);

  const accept = useCallback(
    async (requestId: number) => {
      setMutating(`accept:${requestId}`);
      setError('');
      try {
        await apiClient.acceptFriendRequest(requestId);
        showToast('Accepted.');
        await loadAll();
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Failed to accept.');
      } finally {
        setMutating(null);
      }
    },
    [loadAll, showToast]
  );

  const decline = useCallback(
    async (requestId: number) => {
      setMutating(`decline:${requestId}`);
      setError('');
      try {
        await apiClient.declineFriendRequest(requestId);
        showToast('Declined.');
        await loadAll();
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Failed to decline.');
      } finally {
        setMutating(null);
      }
    },
    [loadAll, showToast]
  );

  const cancel = useCallback(
    async (requestId: number) => {
      setMutating(`cancel:${requestId}`);
      setError('');
      try {
        await apiClient.cancelFriendRequest(requestId);
        showToast('Canceled.');
        await loadAll();
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Failed to cancel.');
      } finally {
        setMutating(null);
      }
    },
    [loadAll, showToast]
  );

  const best = summary?.stats?.bestMs ?? null;
  const ao5 = summary?.stats?.ao5Ms ?? null;
  const ao12 = summary?.stats?.ao12Ms ?? null;
  const count = summary?.stats?.count ?? null;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Friends</h1>
            </div>

            <Button variant="ghost" onClick={() => void loadAll()} loading={loading}>
              Refresh
            </Button>
          </div>

          {error && (
            <Card className="bg-destructive/10 border-destructive/40 border">
              <p className="text-destructive">{error}</p>
            </Card>
          )}

          {toast && (
            <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-border/50 bg-card/70 backdrop-blur px-4 py-3 text-sm text-foreground shadow-xl">
              {toast}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT */}
            <div className="lg:col-span-4 space-y-6">
              {/* Add friend */}
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Add Friend</h3>
                  <Badge variant="info">email</Badge>
                </div>

                <div className="mt-4 flex gap-3">
                  <Input
                    placeholder="friend@email.com"
                    value={addEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddEmail(e.target.value)}
                    disabled={mutating === 'send'}
                  />
                  <Button variant="primary" onClick={sendRequest} loading={mutating === 'send'}>
                    Send
                  </Button>
                </div>

              </Card>

              {/* Friends list */}
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Your Friends</h3>
                  <Badge variant="default">{friends.length}</Badge>
                </div>

                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : friends.length === 0 ? (
                  <p className="text-muted-foreground">No friends yet.</p>
                ) : (
                  <div className="space-y-2">
                    {friends.map((f) => {
                      const active = f.id === selectedFriendId;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setSelectedFriendId(f.id)}
                          className={cx(
                            'w-full text-left rounded-xl px-4 py-3 border transition-all duration-150',
                            active
                              ? 'border-blue-500/40 bg-blue-500/10'
                              : 'border-border/50 bg-background/20 hover:bg-background/30 hover:border-border'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {shortName(f.name, f.email)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{f.email || ''}</p>
                            </div>

                            {active ? <Badge variant="success">Selected</Badge> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Requests (kept compact) */}
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Requests</h3>
                  <div className="flex gap-2">
                    <Badge variant="default">in {incoming.length}</Badge>
                    <Badge variant="default">out {outgoing.length}</Badge>
                  </div>
                </div>

                {/* Incoming */}
                <div>
                  <p className="text-sm font-semibold text-foreground/90 mb-2">Incoming</p>
                  {incoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <div className="space-y-2">
                      {incoming.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border/50 bg-background/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {shortName(r.fromUser?.name, r.fromUser?.email)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.fromUser?.email || ''}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-1">{fmtWhen(r.createdAt)}</p>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                onClick={() => void accept(r.id)}
                                loading={mutating === `accept:${r.id}`}
                                className="px-3 py-2"
                              >
                                Accept
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => void decline(r.id)}
                                loading={mutating === `decline:${r.id}`}
                                className="px-3 py-2"
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outgoing */}
                <div className="mt-5">
                  <p className="text-sm font-semibold text-foreground/90 mb-2">Outgoing</p>
                  {outgoing.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <div className="space-y-2">
                      {outgoing.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border/50 bg-background/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {shortName(r.toUser?.name, r.toUser?.email)}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.toUser?.email || ''}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-1">{fmtWhen(r.createdAt)}</p>
                            </div>

                            <Button
                              variant="secondary"
                              onClick={() => void cancel(r.id)}
                              loading={mutating === `cancel:${r.id}`}
                              className="px-3 py-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* RIGHT */}
            <div className="lg:col-span-8 space-y-6">
              {/* Friend header + stats */}
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">
                      {selectedFriend ? shortName(selectedFriend.name, selectedFriend.email) : 'Select a friend'}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {selectedFriend?.email || summary?.user?.email || ''}
                    </p>
                  </div>

                  {selectedFriendId != null ? (
                    <Badge variant="info">Friend #{selectedFriendId}</Badge>
                  ) : (
                    <Badge variant="default">No selection</Badge>
                  )}
                </div>

                <div className="mt-6">
                  {selectedFriendId == null ? (
                    <p className="text-muted-foreground">Pick someone from the left.</p>
                  ) : detailLoading ? (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading stats...
                    </div>
                  ) : !summary ? (
                    <p className="text-muted-foreground">No summary loaded.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatTile
                        label="Best Single"
                        value={best != null ? formatDisplayTime(best, 'OK') : '—'}
                        accent="blue"
                      />
                      <StatTile
                        label="Ao5"
                        value={ao5 != null ? formatDisplayTime(ao5, 'OK') : '—'}
                        accent="default"
                      />
                      <StatTile
                        label="Ao12"
                        value={ao12 != null ? formatDisplayTime(ao12, 'OK') : '—'}
                        accent="default"
                      />
                      <StatTile label="Total Solves" value={count != null ? count : '—'} accent="green" />
                    </div>
                  )}

                  {summary?.stats?.avgScore != null && (
                    <div className="mt-5 rounded-2xl border border-border/50 bg-background/20 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Avg Score</p>
                        <Badge variant="success">{summary.stats.avgScore.toFixed(2)}</Badge>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Recent solves */}
              <Card className="border border-border/50 bg-card/60 backdrop-blur">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Recent Solves</h3>
                  <Badge variant="default">{summary?.recentSolves?.length || 0}</Badge>
                </div>

                {!summary ? (
                  <p className="text-muted-foreground">Select a friend to view their recent solves.</p>
                ) : summary.recentSolves.length === 0 ? (
                  <p className="text-muted-foreground">No solves yet.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border/50">
                    <div className="grid grid-cols-12 bg-background/30 px-4 py-2 text-xs text-muted-foreground">
                      <div className="col-span-3">Time</div>
                      <div className="col-span-2">Penalty</div>
                      <div className="col-span-2">Score</div>
                      <div className="col-span-5">When</div>
                    </div>

                    {summary.recentSolves.map((s) => {
                      const timeLabel =
                        s.penalty === 'DNF'
                          ? 'DNF'
                          : s.effectiveTimeMs != null
                          ? formatDisplayTime(s.effectiveTimeMs, 'OK')
                          : s.timeMs != null
                          ? formatMs(s.timeMs)
                          : '—';

                      return (
                        <div
                          key={s.id}
                          className="grid grid-cols-12 px-4 py-3 text-sm border-t border-border/50"
                        >
                          <div className="col-span-3 font-semibold text-foreground">{timeLabel}</div>
                          <div className="col-span-2 text-foreground/80">{s.penalty || 'OK'}</div>
                          <div className="col-span-2 text-foreground/80">
                            {s.mlScore != null ? s.mlScore.toFixed(1) : '—'}
                          </div>
                          <div className="col-span-5 text-muted-foreground">{fmtWhen(s.createdAt)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FriendsPage;
