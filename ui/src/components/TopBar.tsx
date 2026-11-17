import { useEffect, useState } from "react";
import type { Agent, SessionInfo } from "../../../shared/types.ts";
import type { AccountSummary } from "../desktop";
import type { Connection } from "../hooks/useAgents";
import { formatTokens, formatUsd } from "./status";

const CONN: Record<Connection, { text: string; cls: string }> = {
  live: { text: "live", cls: "text-emerald-300" },
  connecting: { text: "menyambung…", cls: "text-amber-300" },
  offline: { text: "offline · mencoba lagi", cls: "text-red-400" },
  "no-token": { text: "token belum ada", cls: "text-red-400" },
};

function elapsed(from: number, now: number) {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function TopBar({ agents, session, connection, lastError, workspace, account, nickname, onSettings }: {
  agents: Agent[];
  session: SessionInfo | null;
  connection: Connection;
  lastError: string | null;
  /** Folder kerja agent; hanya diketahui di app desktop. */
  workspace?: string;
  /** Akun Claude yang terhubung dengan token; hanya diketahui di app desktop setelah token diisi. */
  account?: AccountSummary;
  /** Nama panggilan dari Pengaturan; kosong = tanpa sapaan. */
  nickname?: string;
  /** Hanya ada di app desktop. */
  onSettings?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const running = agents.filter((a) => a.status === "running").length;
  const budget = session?.budget ?? 0;
  const spent = session?.spent ?? 0;
  const cost = session?.costUsd ?? 0;
  const budgetUsd = session?.budgetUsd ?? 0;
  // Bar memakai batas yang paling dekat tercapai (token atau USD).
  const pct = Math.max(budget ? (spent / budget) * 100 : 0, budgetUsd ? (cost / budgetUsd) * 100 : 0);
  const limited = budget > 0 || budgetUsd > 0;

  // Model yang dipakai, dikelompokkan: "claude-sonnet-5-5 ×5".
  const models = new Map<string, number>();
  for (const a of agents) models.set(`${a.provider}/${a.model}`, (models.get(`${a.provider}/${a.model}`) ?? 0) + 1);

  return (
    <>
    <header className="flex h-10 shrink-0 items-center gap-6 border-b border-signal/20 bg-panel px-4 text-[11px]">
      <span className="font-display text-[15px] font-bold uppercase tracking-[0.35em] text-zinc-100">
        simply<span className="text-signal">/</span>agent
      </span>
      <span className={CONN[connection].cls} role="status">● {CONN[connection].text}</span>
      {lastError && <span className="text-red-400">{lastError}</span>}
      <span className="ml-auto text-dim">
        <span className="text-zinc-100">{running}</span>/{agents.length} running
      </span>
      <span className="text-dim" title="Waktu sejak server engine mulai">
        sesi <span className="tabular-nums text-zinc-100">{session ? elapsed(session.startedAt, now) : "--:--:--"}</span>
      </span>
      <span className="flex items-center gap-2 text-dim" title="Total token dan biaya semua agent Claude. Provider CLI tidak dihitung.">
        token <span className="tabular-nums text-zinc-100">{formatTokens(spent)}</span>
        {budget > 0 && <span>/ {formatTokens(budget)}</span>}
        <span className="tabular-nums text-zinc-100">{formatUsd(cost)}</span>
        {budgetUsd > 0 && <span>/ {formatUsd(budgetUsd)}</span>}
        {limited && (
          <span className="h-1 w-20 bg-zinc-800" role="meter" aria-label="Pemakaian budget" aria-valuenow={Math.round(Math.min(100, pct))} aria-valuemin={0} aria-valuemax={100}>
            <span className={`block h-full ${pct >= 90 ? "bg-red-500" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </span>
        )}
      </span>
      {onSettings && (
        <button
          onClick={onSettings}
          aria-label="Pengaturan"
          title="Pengaturan (Ctrl+,)"
          className="border border-signal/30 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-200 outline-none hover:bg-signal/10 focus-visible:ring-1 focus-visible:ring-signal"
        >
          ⚙ pengaturan
        </button>
      )}
    </header>
    <div className="flex h-6 shrink-0 items-center gap-6 border-b border-signal/10 bg-ink px-4 text-[10px] text-dim" data-testid="info-bar">
      <span className="shrink-0" title="Provider dan model yang dipakai agent">
        AI{" "}
        {models.size === 0 ? "—" : [...models].map(([m, n], i) => (
          <span key={m}>{i > 0 && " · "}<span className="text-zinc-100">{m}</span> ×{n}</span>
        ))}
      </span>
      {workspace && (
        <span className="min-w-0 flex-1 truncate" title={workspace}>
          folder <span className="text-zinc-100" data-testid="info-workspace">{workspace}</span>
        </span>
      )}
      {(account?.email || nickname) && (
        <span className="ml-auto shrink-0" data-testid="info-account" title="Akun Claude yang terhubung dengan token">
          {nickname && <span>Halo, <span className="text-signal">{nickname}</span></span>}
          {nickname && account?.email && " · "}
          {account?.email && <>akun <span className="text-zinc-100">{account.email}</span></>}
          {account?.organization && <span> · {account.organization}</span>}
          {account?.plan && <span> · {account.plan}</span>}
        </span>
      )}
    </div>
    </>
  );
}
