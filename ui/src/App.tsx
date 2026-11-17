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
import type { AccountSummary } from "./desktop";

const nodeTypes = { agent: AgentNode, group: GroupNode, preview: PreviewNode };
const edgeTypes = { pulse: PulseEdge };
const PREVIEW = import.meta.env.VITE_PREVIEW_URL as string | undefined;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

function Canvas() {
  const { agents: allAgents, edges: allEdges, session, connection, lastError, sendCommand, control } = useAgents();
  const { setCenter, fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const desktop = !!window.simply;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<string>();
  const [account, setAccount] = useState<AccountSummary>();
  const [nickname, setNickname] = useState("");
  // Di app desktop agent baru ditampilkan setelah token terpasang. null = belum diketahui (dianggap belum).
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const locked = desktop && hasToken !== true;
  const agents = locked ? [] : allAgents;
  const edges = locked ? [] : allEdges;
  const loadProfile = useCallback((first = false) => {
    window.simply?.getSettings().then((i) => {
      setWorkspace(i.effectiveWorkspace);
      setNickname(i.settings.nickname);
      setHasToken(!!i.tokenSet.claude);
      if (first && !i.settings.setupDone) setSettingsOpen(true);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadProfile(true); }, [loadProfile]);

  // Hanya di app desktop: menu "Pengaturan…" dari proses utama, dan cek login Claude saat mulai.
  useEffect(() => window.simply?.onOpenSettings(() => setSettingsOpen(true)), []);
  // Akun yang terhubung dengan token: diambil saat mulai dan setiap token bisa berubah (dialog Pengaturan ditutup).
  const loadAccount = useCallback(() => {
    window.simply?.claudeInfo().then((r) => setAccount(r.ok ? r.account : undefined)).catch(() => setAccount(undefined));
  }, []);
  useEffect(() => { loadAccount(); }, [loadAccount]);
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
      <TopBar agents={agents} session={session} connection={connection} lastError={lastError} workspace={workspace} account={account} nickname={nickname} onSettings={desktop ? () => setSettingsOpen(true) : undefined} />
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
            {!locked && (<MiniMap
              pannable
              zoomable
              bgColor="#0a0e12"
              maskColor="rgba(7,7,10,0.6)"
              nodeBorderRadius={2}
              nodeStrokeWidth={4}
              nodeColor={(n) => (n.type === "group" ? "rgba(34,211,238,0.08)" : n.type === "preview" ? "#14333a" : "#22d3ee")}
              nodeStrokeColor={(n) => (n.type === "group" ? "rgba(34,211,238,0.6)" : "transparent")}
            />)}
          </ReactFlow>
          {connection === "no-token" && (
            <div role="alert" className="absolute inset-x-0 top-8 z-20 mx-auto w-[min(560px,calc(100%-2rem))] border border-signal/60 bg-panel p-4 text-xs leading-5">
              <p className="mb-1 font-display text-[13px] uppercase tracking-[0.25em] text-red-400">token belum ada</p>
              Jalankan server (<code>cd server &amp;&amp; npm start</code>), lalu buka URL yang dicetak di terminal:
              <code className="mt-1 block text-zinc-100">http://localhost:5173/?token=…</code>
            </div>
          )}
          {locked && (
            <div data-testid="no-agents" className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
              <div className="max-w-sm border border-signal/30 bg-panel/90 p-5 text-xs leading-5 text-dim">
                <p className="mb-1 font-display text-[13px] uppercase tracking-[0.25em] text-zinc-100">belum ada agent</p>
                Agent muncul setelah token terpasang. Petunjuk cara mendapatkan token ada di Pengaturan, bagian token provider.
                <div className="mt-3">
                  <button onClick={() => setSettingsOpen(true)}
                    className="border border-signal/50 px-3 py-1 text-[11px] uppercase tracking-widest text-cyan-100 outline-none hover:bg-signal/15 focus-visible:ring-1 focus-visible:ring-signal">
                    isi token
                  </button>
                </div>
              </div>
            </div>
          )}
          {!locked && <CommandBar agents={ordered} onSend={sendCommand} onStopAll={stopAll} />}
        </main>
        {settingsOpen && <SettingsDialog agents={orderAgents(allAgents)} onClose={() => { setSettingsOpen(false); loadAccount(); loadProfile(); }} />}
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
