// Kontrak data bersama antara server dan UI. Ubah di sini saja.
export type AgentStatus = "running" | "idle" | "waiting" | "error" | "done" | "paused";
export type Provider = "claude" | "codex" | "gemini";

export interface Agent {
  id: string;
  name: string;
  role: string; // coordinator | reviewer | frontend | tester | assistant
  provider: Provider;
  model: string;
  status: AgentStatus;
  task: string;
  log: string[];
  files: string[]; // path relatif terhadap workspace yang disentuh tool agent
  queued: number; // jumlah tugas yang menunggu di antrean
  paused: boolean; // antrean ditahan; giliran yang sedang jalan tetap selesai
  tokens: number;
  costUsd: number; // biaya dari SDK (total_cost_usd); 0 untuk provider CLI
  startedAt: number;
}

export interface AgentEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  active?: boolean;
}

export interface SessionInfo {
  startedAt: number;
  spent: number; // total token semua agent
  budget: number; // batas token, 0 = tanpa batas
  costUsd: number; // total biaya semua agent
  budgetUsd: number; // batas biaya, 0 = tanpa batas
}

export type ServerEvent =
  | { type: "snapshot"; agents: Agent[]; edges: AgentEdge[]; session: SessionInfo }
  | { type: "agent"; agent: Agent }
  | { type: "edge"; edge: AgentEdge }
  | { type: "session"; session: SessionInfo }
  | { type: "error"; message: string };

export type ControlAction = "pause" | "resume" | "retry" | "kill";

export type ClientMessage =
  | { type: "command"; text: string; targetIds?: string[] }
  | { type: "control"; agentId: string; action: ControlAction };
