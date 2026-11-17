import { WebSocketServer, type WebSocket } from "ws";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ServerEvent } from "../../shared/types.ts";
import { Engine, type Limits, type Runner } from "./engine.ts";

const Incoming = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), text: z.string().min(1).max(4000), targetIds: z.array(z.string()).max(20).optional() }),
  z.object({ type: z.literal("control"), agentId: z.string(), action: z.enum(["pause", "resume", "retry", "kill"]) }),
]);

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function startServer(opts: {
  port: number;
  workspace: string;
  token: string;
  origins?: string[];
  runner?: Runner;
  limits?: Limits;
  stateDir?: string;
  models?: Record<string, string>;
}) {
  const origins = opts.origins ?? DEFAULT_ORIGINS;
  const engine = new Engine(opts.workspace, opts.runner, opts.limits, { stateDir: opts.stateDir, models: opts.models });
  const wss = new WebSocketServer({
    port: opts.port,
    host: "127.0.0.1",
    maxPayload: 64 * 1024,
    // Tolak koneksi tanpa token yang benar, dan dari origin browser lain (cegah situs lain membuka socket ini).
    verifyClient: ({ origin, req }, done) => {
      const token = new URL(req.url ?? "/", "http://x").searchParams.get("token") ?? "";
      if (!sameToken(token, opts.token)) return done(false, 401, "token salah");
      if (origin && !origins.includes(origin)) return done(false, 403, "origin ditolak");
      done(true);
    },
  });

  const send = (ws: WebSocket, e: ServerEvent) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e)); };
  const unsubscribe = engine.subscribe((e) => wss.clients.forEach((ws) => send(ws, e)));

  wss.on("connection", (ws) => {
    send(ws, engine.snapshot());
    ws.on("message", (raw) => {
      let msg: z.infer<typeof Incoming>;
      try { msg = Incoming.parse(JSON.parse(raw.toString())); }
      catch { return send(ws, { type: "error", message: "pesan tidak valid" }); }
      if (msg.type === "command") engine.command(msg.text, msg.targetIds);
      else engine.control(msg.agentId, msg.action);
    });
  });

  const ready = new Promise<number>((res) => wss.on("listening", () => {
    const addr = wss.address();
    res(typeof addr === "object" && addr ? addr.port : opts.port);
  }));

  const close = () => new Promise<void>((res) => {
    unsubscribe();
    engine.shutdown();
    wss.clients.forEach((c) => c.terminate());
    wss.close(() => res());
  });

  return { engine, wss, ready, close };
}
