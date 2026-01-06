import axios, { AxiosInstance } from 'axios';
import { User, Solve, LiveStats, DashboardSummary, Scramble, PaginatedSolves } from '@/types/api';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('rubiks_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('rubiks_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async signup(email: string, password: string, name: string): Promise<{ user: User }> {
    const response = await this.client.post('/auth/signup', { email, password, name });
    return response.data;
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Scramble endpoint (NOW RETURNS state)
  async getScramble(event: string = '3x3'): Promise<Scramble> {
    const response = await this.client.get('/scramble', { params: { event } });
    return response.data;
  }

  // Solves endpoints
  async createSolve(data: {
    scramble: string;
    timeMs: number;
    penalty?: string | null;
    source?: string;
    notes?: string;
    event?: string;
    state?: string;
    solutionMoves?: string[];
    numMoves?: number;
    tags?: string[];
  }): Promise<{ solve: Solve; liveStats: LiveStats }> {
    const response = await this.client.post('/solves', data);
    return response.data;
  }

  async getLiveStats(event: string = '3x3'): Promise<LiveStats> {
    const response = await this.client.get('/solves/live-stats', { params: { event } });
    return response.data;
  }

  async getSolves(params?: {
    limit?: number;
    cursor?: string;
    event?: string;
    penalty?: string;
    source?: string;
    hasScore?: boolean;
    hasSolution?: boolean;
    from?: string;
    to?: string;
  }): Promise<PaginatedSolves> {
    const response = await this.client.get('/solves', { params });
    return response.data;
  }

  async getSolve(id: number): Promise<{ solve: Solve }> {
    const response = await this.client.get(`/solves/${id}`);
    return response.data;
  }

  async updateSolve(
    id: number,
    data: {
      penalty?: string | null;
      notes?: string;
    }
  ): Promise<{ solve: Solve }> {
    const response = await this.client.patch(`/solves/${id}`, data);
    return response.data;
  }

  async deleteSolve(id: number): Promise<{ success: boolean }> {
    const response = await this.client.delete(`/solves/${id}`);
    return response.data;
  }

  async scoreSolve(id: number): Promise<{ mlScore: number; scoreVersion: string }> {
    // send {} explicitly (some servers expect a JSON body)
    const response = await this.client.post(`/solves/${id}/score`, {});
    return response.data;
  }

  // Compute optimal solution WITHOUT saving
  async getOptimalSolution(data: {
    state: string;   // 54 chars, URFDLB
    event?: string;  // "3x3"
  }): Promise<{ solutionMoves: string[]; numMoves: number }> {
    const response = await this.client.post('/solves/optimal', data);
    return response.data;
  }

  // Dashboard endpoint
  async getDashboardSummary(range: string = '30d'): Promise<DashboardSummary> {
    const response = await this.client.get('/dashboard/summary', { params: { range } });
    return response.data;
  }

  // Onboarding endpoints
  async setSelfReportedAverage(avgSeconds: number): Promise<{
    skillSource: string;
    selfReported333AvgMs: number;
    skillPriorMs: number;
    }> {
    const response = await this.client.post('/auth/me/skill/self-reported', { avgSeconds });
    return response.data;
  }

  async linkWca(wcaId: string): Promise<{
    wcaId: string;
    wca333AvgMs: number | null;
    wca333SingleMs: number | null;
    skillSource: string;
    skillPriorMs: number | null;
    }> {
    const response = await this.client.post('/auth/me/skill/wca', { wcaId });
    return response.data;
  }
}

export const apiClient = new APIClient();
