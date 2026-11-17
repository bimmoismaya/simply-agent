import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { ServerEvent } from "../../shared/types.ts";
import type { Runner } from "./engine.ts";
import { startServer } from "./index.ts";

const runner: Runner = async (_cfg, task, ctx) => {
  ctx.onTool("Read", "notes.md");
  ctx.onTool("Read", "/etc/hostname"); // ditolak policy: tidak boleh masuk daftar file
  ctx.onText(`jawab: ${task}\n`);
  return { text: `jawab: ${task}\n`, tokens: 3 };
};

function connect(port: number, token: string, origin?: string) {
  return new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`, origin ? { origin } : {});
}

test("e2e: token, origin, perintah sampai ke agent, state tersimpan", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "e2e-"));
  const srv = startServer({ port: 0, workspace, token: "rahasia", runner });
  t.after(() => srv.close());
  const port = await srv.ready;

  // Token salah ditolak.
  const bad = connect(port, "salah");
  const badCode = await new Promise<number>((res) => bad.on("unexpected-response", (_req, r) => res(r.statusCode ?? 0)));
  assert.equal(badCode, 401);

  // Origin asing ditolak walau token benar.
  const evil = connect(port, "rahasia", "https://evil.example");
  const evilCode = await new Promise<number>((res) => evil.on("unexpected-response", (_req, r) => res(r.statusCode ?? 0)));
  assert.equal(evilCode, 403);

  // Klien sah menerima snapshot lalu event dari tugas.
  const ws = connect(port, "rahasia", "http://localhost:5173");
  const events: ServerEvent[] = [];
  const done = new Promise<void>((res) => ws.on("message", (raw) => {
    const e = JSON.parse(raw.toString()) as ServerEvent;
    events.push(e);
    if (e.type === "snapshot") ws.send(JSON.stringify({ type: "command", text: "halo", targetIds: ["otto"] }));
    if (e.type === "agent" && e.agent.id === "otto" && e.agent.status === "done") res();
  }));
  await done;
  ws.close();

  assert.equal(events[0].type, "snapshot");
  const last = events.filter((e) => e.type === "agent" && e.agent.id === "otto").pop();
  assert.ok(last && last.type === "agent");
  assert.ok(last.agent.log.includes("jawab: halo"));
  assert.deepEqual(last.agent.files, ["notes.md"]);
  assert.ok(events.some((e) => e.type === "session" && e.session.spent === 3));
  assert.ok(existsSync(join(workspace, ".engine", "state.json")));
});

test("e2e: pesan tidak valid dibalas error, server tetap hidup", async (t) => {
  const srv = startServer({ port: 0, workspace: mkdtempSync(join(tmpdir(), "e2e-")), token: "t", runner });
  t.after(() => srv.close());
  const ws = connect(await srv.ready, "t");
  const err = await new Promise<ServerEvent>((res) => ws.on("message", (raw) => {
    const e = JSON.parse(raw.toString()) as ServerEvent;
    if (e.type === "snapshot") ws.send(JSON.stringify({ type: "control", agentId: "pip", action: "hapus-semua" }));
    if (e.type === "error") res(e);
  }));
  assert.equal(err.type, "error");
  ws.close();
});
