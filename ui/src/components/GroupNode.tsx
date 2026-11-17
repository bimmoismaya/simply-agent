import type { NodeProps, Node } from "@xyflow/react";

export type GroupNodeData = { role: string; running: number; total: number; width: number; height: number };

// Bingkai per peran, seperti panel "TESTERS 2 · 2 running" di referensi.
export function GroupNode({ data }: NodeProps<Node<GroupNodeData>>) {
  return (
    <div
      className="rounded-[3px] border border-signal/35 bg-panel-2/40"
      style={{ width: data.width, height: data.height }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 font-display text-[12px] uppercase tracking-[0.25em] text-signal">
        <span>{data.role}</span>
        <span className="text-dim">{data.total}</span>
        <span className="text-dim">·</span>
        <span className={data.running ? "text-emerald-300" : "text-dim"}>{data.running} running</span>
      </div>
    </div>
  );
}
