import type { Agent } from "../../../shared/types.ts";

export const STATUS_DOT: Record<Agent["status"], string> = {
  running: "bg-emerald-400 animate-pulse",
  idle: "bg-zinc-500",
  waiting: "bg-amber-400",
  error: "bg-red-500",
  done: "bg-zinc-300",
  paused: "bg-amber-600",
};

export const STATUS_TEXT: Record<Agent["status"], string> = {
  running: "text-emerald-300",
  idle: "text-dim",
  waiting: "text-amber-300",
  error: "text-red-400",
  done: "text-zinc-300",
  paused: "text-amber-400",
};

export const tokenLabel = (a: Agent) =>
  a.provider === "claude" ? `${formatTokens(a.tokens)} tok · ${formatUsd(a.costUsd)}` : "tok n/a";

export const formatUsd = (n: number) => `$${n < 1 ? n.toFixed(n < 0.1 ? 3 : 2) : n.toFixed(2)}`;

export function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
