import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "../../shared/types.ts";
import { Engine, type Runner } from "./engine.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "engine-"));

// Runner palsu: jawaban per agent, tanpa memanggil model.
function fakeRunner(replies: Record<string, string>, calls: string[] = []): Runner {
  return async (cfg, task, ctx) => {
    calls.push(`${cfg.id}:${task}`);
    ctx.onText(replies[cfg.id] ?? "ok\n");
    return { text: replies[cfg.id] ?? "ok\n", tokens: 10 };
  };
}

// Runner yang menggantung sampai dibatalkan atau dilepas manual.
function blockingRunner() {
  let release!: () => void;
  const started: string[] = [];
  const runner: Runner = (cfg, task, ctx) => new Promise((res, rej) => {
    started.push(`${cfg.id}:${task}`);
    release = () => res({ text: "selesai\n", tokens: 5 });
    ctx.signal.addEventListener("abort", () => rej(new Error("abort")), { once: true });
  });
  return { runner, started, release: () => release() };
}

const status = (o: Engine, id: string) => o.agents().find((a) => a.id === id)!.status;

test("state tersimpan dan dimuat ulang tanpa status paused", () => {
  const dir = tmp();
  const a = new Engine(dir, fakeRunner({}));
  assert.equal(a.agents().length, 8);
  a.command("x", ["dax"]);
  a.control("dax", "pause");
  return a.idle().then(() => {
    const b = new Engine(dir, fakeRunner({}));
    assert.equal(status(b, "dax"), "idle");
    assert.ok(b.agents().find((x) => x.id === "dax")!.log.includes("> x"));
  });
});

test("DELEGATE valid diteruskan ke agent target dan edge menyala dengan label", async () => {
  const calls: string[] = [];
  const o = new Engine(tmp(), fakeRunner({
    pip: 'rencana\nDELEGATE: {"to":"Dax","task":"review a.ts"}\nDELEGATE: {"to":"ken","task":"tes a.ts"}\n',
  }, calls));
  const edges: ServerEvent[] = [];
  o.subscribe((e) => { if (e.type === "edge") edges.push(e); });
  o.command("mulai");
  await o.idle();
  assert.deepEqual(calls, ["pip:mulai", "dax:review a.ts", "ken:tes a.ts"]);
  const active = edges.filter((e) => e.type === "edge" && e.edge.active);
  assert.equal(active.length, 2);
  assert.equal(active[0].type === "edge" && active[0].edge.label, "review a.ts");
});

test("DELEGATE rusak atau ke agent tak dikenal dicatat dan dilewati", async () => {
  const calls: string[] = [];
  const o = new Engine(tmp(), fakeRunner({
    pip: 'DELEGATE: {"to":"Dax"}\nDELEGATE: bukan json\nDELEGATE: {"to":"Zed","task":"x"}\n',
  }, calls));
  o.command("mulai");
  await o.idle();
  assert.deepEqual(calls, ["pip:mulai"]);
  const log = o.agents().find((a) => a.id === "pip")!.log;
  assert.equal(log.filter((l) => l.startsWith("[delegate]")).length, 3);
});

test("pause menahan antrean tapi giliran berjalan tetap selesai; resume melanjutkan", async () => {
  const b = blockingRunner();
  const o = new Engine(tmp(), b.runner);
  o.command("satu", ["dax"]);
  o.command("dua", ["dax"]);
  assert.deepEqual(b.started, ["dax:satu"]);
  o.control("dax", "pause");
  b.release();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(b.started, ["dax:satu"], "tugas kedua tertahan");
  assert.equal(status(o, "dax"), "paused");
  assert.equal(o.agents().find((a) => a.id === "dax")!.queued, 1);
  o.control("dax", "resume");
  assert.deepEqual(b.started, ["dax:satu", "dax:dua"]);
  b.release();
  await o.idle();
  assert.equal(status(o, "dax"), "done");
});

test("kill membatalkan giliran berjalan dan mengosongkan antrean", async () => {
  const b = blockingRunner();
  const o = new Engine(tmp(), b.runner);
  o.command("satu", ["maya"]);
  o.command("dua", ["maya"]);
  o.control("maya", "kill");
  await o.idle();
  assert.deepEqual(b.started, ["maya:satu"]);
  assert.equal(status(o, "maya"), "idle");
  assert.ok(o.agents().find((a) => a.id === "maya")!.log.includes("[kill] giliran dibatalkan"));
});

test("retry mengulang tugas terakhir", async () => {
  const calls: string[] = [];
  const o = new Engine(tmp(), fakeRunner({}, calls));
  o.command("cek", ["ken"]);
  await o.idle();
  o.control("ken", "retry");
  await o.idle();
  assert.deepEqual(calls, ["ken:cek", "ken:cek"]);
});

test("batas token menahan tugas baru", async () => {
  const calls: string[] = [];
  const o = new Engine(tmp(), fakeRunner({}, calls), { tokens: 10 });
  o.command("satu", ["ada"]);
  await o.idle();
  o.command("dua", ["ada"]);
  await o.idle();
  assert.deepEqual(calls, ["ada:satu"]);
  assert.equal(status(o, "ada"), "waiting");
});

test("pesan ke agent tak dikenal diabaikan tanpa crash", () => {
  const o = new Engine(tmp(), fakeRunner({}));
  assert.doesNotThrow(() => o.command("halo", ["tidak-ada"]));
});

test("tool delegate (jalur utama) meneruskan tugas dan memberi pesan error untuk nama salah", async () => {
  const calls: string[] = [];
  const replies: string[] = [];
  const runner: Runner = async (cfg, task, ctx) => {
    calls.push(`${cfg.id}:${task}`);
    if (cfg.id === "pip") {
      assert.ok(ctx.delegate, "koordinator mendapat tool delegate");
      replies.push(ctx.delegate("juno", "buat tombol"), ctx.delegate("Zed", "x"));
    } else {
      assert.equal(ctx.delegate, undefined, "agent biasa tidak bisa mendelegasikan");
    }
    return { text: "ok\n", tokens: 1, costUsd: 0.01 };
  };
  const o = new Engine(tmp(), runner);
  o.command("mulai");
  await o.idle();
  assert.deepEqual(calls, ["pip:mulai", "juno:buat tombol"]);
  assert.match(replies[0], /^Queued for Juno/);
  assert.match(replies[1], /^Error: agent "Zed" does not exist/);
});

test("batas USD menahan tugas baru dan biaya dijumlahkan", async () => {
  const calls: string[] = [];
  const runner: Runner = async (cfg, task) => { calls.push(task); return { text: "", tokens: 1, costUsd: 0.6 }; };
  const o = new Engine(tmp(), runner, { usd: 1 });
  const sessions: number[] = [];
  o.subscribe((e) => { if (e.type === "session") sessions.push(e.session.costUsd); });
  o.command("a", ["ada"]); await o.idle();
  o.command("b", ["ada"]); await o.idle();
  o.command("c", ["ada"]); await o.idle();
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(Math.round(sessions.at(-1)! * 100), 120);
  assert.equal(Math.round(o.agents().find((x) => x.id === "ada")!.costUsd * 100), 120);
});

test("antrean disimpan dan dipulihkan dalam keadaan pause setelah restart", async () => {
  const dir = tmp();
  const b = blockingRunner();
  const a = new Engine(dir, b.runner);
  a.command("satu", ["lia"]);
  a.command("dua", ["lia"]);
  a.command("tiga", ["lia"]);
  // Proses "mati" saat tugas satu berjalan: antrean dua dan tiga harus selamat.
  const calls: string[] = [];
  const c = new Engine(dir, fakeRunner({}, calls));
  const lia = c.agents().find((x) => x.id === "lia")!;
  assert.equal(lia.status, "paused");
  assert.equal(lia.queued, 2);
  assert.deepEqual(calls, [], "tidak jalan otomatis");
  c.control("lia", "resume");
  await c.idle();
  assert.deepEqual(calls, ["lia:dua", "lia:tiga"]);
  b.release();
});

test("stateDir memisahkan state dari workspace", async () => {
  const ws = tmp();
  const st = tmp();
  const o = new Engine(ws, fakeRunner({}), {}, { stateDir: st });
  o.command("x", ["ken"]);
  await o.idle();
  const { existsSync } = await import("node:fs");
  assert.ok(existsSync(join(st, "state.json")), "state di stateDir");
  assert.ok(!existsSync(join(ws, ".engine")), "tidak ada state di workspace");
});

test("models dari opsi dan configure() dipakai mulai giliran berikutnya", async () => {
  const used: string[] = [];
  const runner: Runner = async (cfg) => { used.push(`${cfg.id}:${cfg.model}`); return { text: "", tokens: 0 }; };
  const o = new Engine(tmp(), runner, {}, { models: { dax: "claude-haiku-5-5" } });
  assert.equal(o.agents().find((a) => a.id === "dax")!.model, "claude-haiku-5-5");
  o.command("a", ["dax"]); await o.idle();
  o.configure({ models: { dax: "claude-opus-5-5" } });
  assert.equal(o.agents().find((a) => a.id === "dax")!.model, "claude-opus-5-5");
  o.command("b", ["dax"]); await o.idle();
  assert.deepEqual(used, ["dax:claude-haiku-5-5", "dax:claude-opus-5-5"]);
});

test("configure() menaikkan batas dan melepas agent yang tertahan budget", async () => {
  const calls: string[] = [];
  const o = new Engine(tmp(), fakeRunner({}, calls), { tokens: 10 });
  o.command("satu", ["ada"]); await o.idle();
  o.command("dua", ["ada"]); await o.idle();
  assert.equal(status(o, "ada"), "waiting");
  const sessions: number[] = [];
  o.subscribe((e) => { if (e.type === "session") sessions.push(e.session.budget); });
  o.configure({ limits: { tokens: 1000 } });
  await o.idle();
  assert.deepEqual(calls, ["ada:satu", "ada:dua"]);
  assert.equal(sessions[0], 1000);
});
