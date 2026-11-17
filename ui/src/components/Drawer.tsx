import { useEffect, useRef } from "react";
import type { Agent, ControlAction } from "../../../shared/types.ts";
import { AgentIcon } from "./AgentIcon";
import { STATUS_DOT, STATUS_TEXT, tokenLabel } from "./status";

const PAUSE_HINT = "Menahan antrean. Giliran yang sedang jalan tetap diselesaikan.";

export function Drawer({ agent, onClose, onControl }: {
  agent: Agent;
  onClose: () => void;
  onControl: (id: string, action: ControlAction) => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [agent.log.length]);

  const running = agent.status === "running";
  const buttons: { action: ControlAction; label: string; enabled: boolean; title: string; danger?: boolean }[] = [
    agent.paused
      ? { action: "resume", label: "Resume", enabled: true, title: "Lanjutkan antrean" }
      : { action: "pause", label: "Pause", enabled: true, title: PAUSE_HINT },
    { action: "retry", label: "Retry", enabled: !running && !!agent.task, title: "Ulangi tugas terakhir" },
    { action: "kill", label: "Kill", enabled: running || agent.queued > 0, title: "Batalkan giliran berjalan dan kosongkan antrean", danger: true },
  ];

  return (
    <aside aria-label={`Detail ${agent.name}`} className="flex w-[380px] shrink-0 flex-col border-l border-signal/30 bg-panel text-xs">
      <div className="flex items-center gap-2 border-b border-signal/20 px-4 py-3">
        <AgentIcon role={agent.role} className="h-4 w-4" dim={agent.status === "idle"} />
        <h2 className="text-sm font-semibold text-zinc-100">{agent.name}</h2>
        <span className="font-display text-[12px] uppercase tracking-[0.25em] text-signal">{agent.role}</span>
        <button onClick={onClose} className="ml-auto px-1 text-dim outline-none hover:text-zinc-100 focus-visible:ring-1 focus-visible:ring-signal" aria-label="Tutup detail (Esc)">
          esc ✕
        </button>
      </div>

      <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 border-b border-signal/20 px-4 py-3 text-[11px]">
        <dt className="text-dim">status</dt>
        <dd className={`flex items-center gap-1.5 ${STATUS_TEXT[agent.status]}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
          {agent.status}{agent.paused && " · antrean ditahan"}
        </dd>
        <dt className="text-dim">model</dt><dd>{agent.provider} · {agent.model}</dd>
        <dt className="text-dim">antrean</dt><dd>{agent.queued}</dd>
        <dt className="text-dim">token</dt><dd>{tokenLabel(agent)}</dd>
        <dt className="text-dim">tugas</dt><dd className="break-words text-zinc-100">{agent.task || "—"}</dd>
      </dl>

      <div className="flex gap-2 border-b border-signal/20 px-4 py-3">
        {buttons.map((b) => (
          <button
            key={b.action}
            disabled={!b.enabled}
            title={b.title}
            onClick={() => onControl(agent.id, b.action)}
            className={`border px-3 py-1 text-[11px] uppercase tracking-widest outline-none focus-visible:ring-1 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-35 ${
              b.danger ? "border-red-500/60 text-red-300 hover:bg-red-500/20" : "border-signal/30 text-zinc-200 hover:bg-signal/10"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {!agent.paused && <p className="px-4 pt-2 text-[10px] text-dim">Pause = {PAUSE_HINT}</p>}

      <section className="border-b border-signal/20 px-4 py-3">
        <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">file disentuh ({agent.files.length})</h3>
        {agent.files.length === 0
          ? <p className="text-[11px] text-dim">Belum ada.</p>
          : <ul className="max-h-24 overflow-y-auto text-[11px] text-zinc-300">{agent.files.map((f) => <li key={f} className="truncate">{f}</li>)}</ul>}
      </section>

      <h3 className="px-4 pt-3 font-display text-[12px] uppercase tracking-[0.25em] text-signal">log</h3>
      <pre ref={logRef} className="flex-1 overflow-y-auto whitespace-pre-wrap break-words px-4 py-2 text-[11px] leading-4 text-zinc-300">
        {agent.log.join("\n") || "Belum ada aktivitas."}
      </pre>
    </aside>
  );
}
