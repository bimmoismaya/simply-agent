import type { Agent, AgentStatus, SessionInfo } from "../../shared/types.ts";

export interface Note { title: string; body: string }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Notifikasi hanya untuk perpindahan status yang berarti: running -> done, dan masuk ke error. */
export function agentNote(prev: AgentStatus | undefined, a: Agent): Note | null {
  if (prev === "running" && a.status === "done") return { title: `${a.name} selesai`, body: clip(a.task, 120) };
  if (a.status === "error" && prev !== "error") {
    const last = [...a.log].reverse().find((l) => l.startsWith("[error]")) ?? "Terjadi error.";
    return { title: `${a.name} error`, body: clip(last.replace(/^\[error\]\s*/, ""), 160) };
  }
  return null;
}

/** Sekali saat budget pertama kali tercapai. */
export function budgetNote(prev: SessionInfo | undefined, s: SessionInfo): Note | null {
  const hit = (x: SessionInfo) => (x.budget > 0 && x.spent >= x.budget) || (x.budgetUsd > 0 && x.costUsd >= x.budgetUsd);
  if (hit(s) && !(prev && hit(prev))) return { title: "Budget tercapai", body: "Tugas baru ditahan. Naikkan batas di Pengaturan untuk melanjutkan." };
  return null;
}

export const isBusy = (agents: Agent[]) => agents.some((a) => a.status === "running" || a.queued > 0);
