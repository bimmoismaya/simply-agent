import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from "@xyflow/react";
import { useAgents } from "./hooks/useAgents";
import { buildLayout, orderAgents } from "./layout";
import { AgentNode } from "./components/AgentNode";
import { GroupNode } from "./components/GroupNode";
import { PreviewNode } from "./components/PreviewNode";
import { PulseEdge, type PulseEdgeData } from "./components/PulseEdge";
import { CommandBar } from "./components/CommandBar";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Drawer } from "./components/Drawer";
import { SettingsDialog } from "./components/SettingsDialog";
import type { AuthInfo } from "./desktop";

const nodeTypes = { agent: AgentNode, group: GroupNode, preview: PreviewNode };
const edgeTypes = { pulse: PulseEdge };
const PREVIEW = import.meta.env.VITE_PREVIEW_URL as string | undefined;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

function Canvas() {
  const { agents, edges, session, connection, lastError, sendCommand, control } = useAgents();
  const { setCenter, fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const desktop = !!window.simply;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [workspace, setWorkspace] = useState<string>();
  useEffect(() => {
    window.simply?.getSettings().then((i) => setWorkspace(i.effectiveWorkspace)).catch(() => {});
  }, []);

  // Hanya di app desktop: menu "Pengaturan…" dari proses utama, dan cek login Claude saat mulai.
  useEffect(() => window.simply?.onOpenSettings(() => setSettingsOpen(true)), []);
  const checkAuth = useCallback(async () => {
    if (!window.simply) return;
    setRechecking(true);
    try { setAuth(await window.simply.authStatus()); } catch { setAuth(null); } finally { setRechecking(false); }
  }, []);
  useEffect(() => { void checkAuth(); }, [checkAuth]);
  const ordered = useMemo(() => orderAgents(agents), [agents]);
  const { nodes, boxes } = useMemo(() => buildLayout(agents, selectedId, PREVIEW), [agents, selectedId]);

  const flowEdges: Edge<PulseEdgeData>[] = edges.map((e) => ({
    id: e.id, source: e.from, target: e.to, type: "pulse", zIndex: -1, data: { active: e.active, label: e.label },
  }));

  // Pas-kan tampilan sekali setelah snapshot pertama tiba.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || agents.length === 0) return;
    fitted.current = true;
    requestAnimationFrame(() => fitView({ padding: 0.12, duration: 0 }));
  }, [agents.length, fitView]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const b = boxes[id];
    if (b) setCenter(b.x + b.w / 2, b.y + b.h / 2, { zoom: 0.95, duration: reducedMotion() ? 0 : 200 });
  }, [boxes, setCenter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedId(null); return; }
      if (isTyping(e.target)) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("command")?.focus(); return; }
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (step && ordered.length) {
        e.preventDefault();
        const i = ordered.findIndex((a) => a.id === selectedId);
        const next = ordered[(i + step + ordered.length) % ordered.length] ?? ordered[0];
        select(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selectedId, select]);

  const selected = agents.find((a) => a.id === selectedId);
  const stopAll = () => agents.filter((a) => a.status === "running" || a.queued > 0).forEach((a) => control(a.id, "kill"));

  return (
    <div className="flex h-full flex-col">
      <TopBar agents={agents} session={session} connection={connection} lastError={lastError} workspace={workspace} onSettings={desktop ? () => setSettingsOpen(true) : undefined} />
      <div className="flex min-h-0 flex-1">
        <Sidebar agents={ordered} selectedId={selectedId} onSelect={select} />
        <main className="vignette relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeClick={(_, n) => { if (n.type === "agent") select(n.id); }}
            onPaneClick={() => setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
          >
            <Background gap={22} size={1} color="#14333a" />
            <MiniMap
              pannable
              zoomable
              bgColor="#0a0e12"
              maskColor="rgba(7,7,10,0.6)"
              nodeBorderRadius={2}
              nodeStrokeWidth={4}
              nodeColor={(n) => (n.type === "group" ? "rgba(34,211,238,0.08)" : n.type === "preview" ? "#14333a" : "#22d3ee")}
              nodeStrokeColor={(n) => (n.type === "group" ? "rgba(34,211,238,0.6)" : "transparent")}
            />
          </ReactFlow>
          {desktop && auth?.loggedIn === false && (
            <div role="alert" data-testid="auth-banner" className="absolute inset-x-0 top-3 z-20 mx-auto w-[min(620px,calc(100%-2rem))] border border-amber-400/70 bg-panel p-4 text-xs leading-5">
              <p className="mb-1 font-display text-[13px] uppercase tracking-[0.25em] text-amber-300">token claude belum diisi</p>
              Agent tidak bisa jalan sebelum token diisi. Jalankan <code className="text-zinc-100">claude setup-token</code> di terminal,
              lalu tempel hasilnya di Pengaturan, bagian token provider.
              <div className="mt-2">
                <button onClick={() => setSettingsOpen(true)}
                  className="mr-2 border border-amber-400/60 px-3 py-1 text-[11px] uppercase tracking-widest text-amber-200 outline-none hover:bg-amber-400/10 focus-visible:ring-1 focus-visible:ring-amber-300">
                  buka pengaturan
                </button>
                <button onClick={checkAuth} disabled={rechecking}
                  className="border border-amber-400/60 px-3 py-1 text-[11px] uppercase tracking-widest text-amber-200 outline-none hover:bg-amber-400/10 focus-visible:ring-1 focus-visible:ring-amber-300 disabled:opacity-40">
                  {rechecking ? "memeriksa…" : "cek ulang"}
                </button>
              </div>
            </div>
          )}
          {connection === "no-token" && (
            <div role="alert" className="absolute inset-x-0 top-8 z-20 mx-auto w-[min(560px,calc(100%-2rem))] border border-signal/60 bg-panel p-4 text-xs leading-5">
              <p className="mb-1 font-display text-[13px] uppercase tracking-[0.25em] text-red-400">token belum ada</p>
              Jalankan server (<code>cd server &amp;&amp; npm start</code>), lalu buka URL yang dicetak di terminal:
              <code className="mt-1 block text-zinc-100">http://localhost:5173/?token=…</code>
            </div>
          )}
          <CommandBar agents={ordered} onSend={sendCommand} onStopAll={stopAll} />
        </main>
        {settingsOpen && <SettingsDialog agents={ordered} onClose={() => { setSettingsOpen(false); void checkAuth(); }} />}
        {selected && <Drawer agent={selected} onClose={() => setSelectedId(null)} onControl={control} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
