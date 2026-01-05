export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
  wcaId?: string | null;
  wca333AvgMs?: number | null;
  wca333SingleMs?: number | null;
  selfReported333AvgMs?: number | null;
  skillSource?: string | null;
  wcaLastFetchedAt?: string | null;
  skillPriorMs?: number | null;
}

export interface Solve {
  id: number;
  event: string;
  scramble: string;
  timeMs: number | null;
  penalty: string | null;
  notes: string | null;
  tags: string[] | null;
  state: string | null;
  solutionMoves: string[] | null; // FIXED
  numMoves: number | null;
  mlScore: number | null;
  scoreVersion: string | null;
  source: string;
  createdAt: string;
}


export interface LiveStats {
  count: number;
  bestMs: number | null;
  worstMs: number | null;
  ao5Ms: number | null;
  ao12Ms: number | null;
  avgMs: number | null;
  avgScore: number | null;
}

export interface DashboardSummary {
  range: string;
  counts: {
    solves: number;
    dnf: number;
    plus2: number;
  };
  timeStats: {
    bestMs: number | null;
    worstMs: number | null;
    avgMs: number | null;
    ao5Ms: number | null;
    ao12Ms: number | null;
  };
  scoreStats: {
    avgScore: number | null;
    bestScore: number | null;
  };
  trend: {
    daily: Array<{
      date: string;
      avgMs: number | null;
      avgScore: number | null;
      count: number;
    }>;
  };
}

export interface Scramble {
  scramble: string;
  event: string;
  state: string;
}

export interface PaginatedSolves {
  items: Solve[];
  nextCursor: string | null;
}
