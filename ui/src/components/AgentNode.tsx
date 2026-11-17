import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Agent } from "../../../shared/types.ts";
import { AgentIcon } from "./AgentIcon";
import { STATUS_DOT, STATUS_TEXT, tokenLabel } from "./status";
import { BIG_H, BIG_W, CARD_H, CARD_W } from "../layout";

export type AgentNodeData = { agent: Agent; big?: boolean };

export function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  const a = data.agent;
  const lines = a.log.slice(data.big ? -9 : -6);
  return (
    <div
      className={`flex flex-col overflow-hidden border bg-panel text-xs transition-shadow duration-150 ${
        selected ? "glow border-signal" : "border-signal/30"}`}
      style={{ width: data.big ? BIG_W : CARD_W, height: data.big ? BIG_H : CARD_H }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-signal" />
      <div className="flex items-center gap-2 border-b border-signal/20 px-3 py-2">
        <AgentIcon role={a.role} className="h-4 w-4 shrink-0" dim={a.status === "idle"} />
        <span className="font-semibold text-zinc-100">{a.name}</span>
        <span className="ml-auto font-display text-[11px] uppercase tracking-[0.2em] text-signal">{a.role}</span>
      </div>
      <div className="flex justify-between px-3 pt-1.5 text-[10px] text-dim">
        <span>{a.model}</span>
        {a.queued > 0 && <span className="text-amber-300">+{a.queued} antre</span>}
      </div>
      <pre
        className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words px-3 py-1.5 text-[11px] leading-4 text-zinc-300"
      >
        {lines.join("\n")}
        {a.status === "running" && <span className="cursor" />}
      </pre>
      <div className="truncate border-t border-signal/10 px-3 py-1 text-[10px] text-dim" title={a.task}>
        {a.task || "—"}
      </div>
      <div className="flex items-center justify-between border-t border-signal/20 px-3 py-1.5 text-[10px]">
        <span className={`flex items-center gap-1.5 ${STATUS_TEXT[a.status]}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
          {a.status}
          {a.paused && a.status === "running" && <span className="text-amber-400">· pause setelah ini</span>}
        </span>
        <span className="text-dim">{tokenLabel(a)}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-signal" />
    </div>
  );
}
