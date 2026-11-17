import { useCallback, useEffect, useRef, useState } from "react";
import "../desktop";
import type { Agent, AgentEdge, ClientMessage, ControlAction, ServerEvent, SessionInfo } from "../../../shared/types.ts";

// Satu-satunya tempat yang bicara ke server. Mengganti sumber data hanya menyentuh file ini.
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://127.0.0.1:8787";
const TOKEN_KEY = "engine-token";
const RETRY_MS = 2000;

// Token datang dari URL yang dicetak server (?token=...), lalu disimpan per tab dan dihapus dari address bar.
function readToken(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    try { sessionStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* storage diblokir: tetap pakai dari URL */ }
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.toString());
    return fromUrl;
  }
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export type Connection = "connecting" | "live" | "offline" | "no-token";

// Di app desktop, proses utama menyediakan alamat dan token lewat preload (tidak pernah lewat URL).
interface Conn { url: string; token: string }

async function resolveConnection(): Promise<Conn | null> {
  if (window.simply) return window.simply.connection();
  const token = readToken();
  return token ? { url: WS_URL, token } : null;
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);

  useEffect(() => {
    let alive = true;
    resolveConnection()
      .then((c) => { if (!alive) return; if (c) setConn(c); else setConnection("no-token"); })
      .catch((e) => { if (alive) { setConnection("offline"); setLastError(String(e)); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!conn) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      setConnection("connecting");
      const sock = new WebSocket(`${conn.url}/?token=${encodeURIComponent(conn.token)}`);
      ws.current = sock;
      sock.onopen = () => setConnection("live");
      sock.onclose = () => {
        setConnection("offline");
        if (!stopped) timer = setTimeout(open, RETRY_MS);
      };
      sock.onmessage = (ev) => {
        const e = JSON.parse(ev.data as string) as ServerEvent;
        if (e.type === "snapshot") { setAgents(e.agents); setEdges(e.edges); setSession(e.session); }
        if (e.type === "agent") setAgents((prev) => {
          const i = prev.findIndex((a) => a.id === e.agent.id);
          if (i < 0) return [...prev, e.agent];
          const next = prev.slice();
          next[i] = e.agent;
          return next;
        });
        if (e.type === "edge") setEdges((prev) => prev.map((x) => (x.id === e.edge.id ? e.edge : x)));
        if (e.type === "session") setSession(e.session);
        if (e.type === "error") setLastError(e.message);
      };
    };
    open();
    return () => { stopped = true; clearTimeout(timer); ws.current?.close(); };
  }, [conn]);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  const sendCommand = useCallback(
    (text: string, targetIds?: string[]) => send({ type: "command", text, targetIds }),
    [send],
  );
  const control = useCallback(
    (agentId: string, action: ControlAction) => send({ type: "control", agentId, action }),
    [send],
  );

  return { agents, edges, session, connection, lastError, sendCommand, control };
}
