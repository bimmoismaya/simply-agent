import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type Edge } from "@xyflow/react";

export type PulseEdgeData = { active?: boolean; label?: string };

// Garis merah tipis; saat pesan lewat, titik bercahaya berjalan di sepanjang garis.
export function PulseEdge(props: EdgeProps<Edge<PulseEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath(props);
  const active = !!props.data?.active;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: "#22d3ee",
          strokeOpacity: active ? 0.95 : 0.35,
          strokeWidth: active ? 1.6 : 1,
          filter: active ? "drop-shadow(0 0 4px #22d3ee)" : undefined,
          transition: "stroke-opacity 150ms",
        }}
      />
      {active && (
        <circle r="3" fill="#a5f3fc" className="pulse-dot" style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}>
          <animateMotion dur="0.9s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {props.data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan pointer-events-none absolute max-w-[220px] truncate border bg-ink px-1.5 py-0.5 text-[10px] ${
              active ? "border-signal/70 text-zinc-100" : "border-signal/20 text-dim"
            }`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {props.data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
