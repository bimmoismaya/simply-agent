import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "../../shared/types.ts";
import { tokenStatus } from "./auth.ts";
import { agentNote, budgetNote, isBusy } from "./notify.ts";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, validateWorkspace, SettingsSchema } from "./settings.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "desk-"));
const agent = (o: Partial<Agent> = {}): Agent => ({
  id: "dax", name: "Dax", role: "reviewer", provider: "claude", model: "m", status: "idle", task: "review a.ts",
  log: [], files: [], queued: 0, paused: false, tokens: 0, costUsd: 0, startedAt: 0, ...o,
});

test("settings: bawaan, simpan lalu muat, dan file rusak dipindah ke .bak", () => {
  const dir = tmp();
  const f = join(dir, "settings.json");
  assert.deepEqual(loadSettings(f), DEFAULT_SETTINGS);
  saveSettings(f, { ...DEFAULT_SETTINGS, toolMode: "all", budgetUsd: 2.5, models: { dax: "claude-haiku-5-5" } });
  const back = loadSettings(f);
  assert.equal(back.toolMode, "all");
  assert.equal(back.budgetUsd, 2.5);
  assert.equal(back.models.dax, "claude-haiku-5-5");
  writeFileSync(f, "{ bukan json");
  assert.deepEqual(loadSettings(f), DEFAULT_SETTINGS);
  assert.ok(existsSync(`${f}.bak`) && !existsSync(f));
});

test("settings: nilai di luar batas ditolak, bukan diam-diam dipakai", () => {
  const dir = tmp();
  const f = join(dir, "settings.json");
  writeFileSync(f, JSON.stringify({ toolMode: "root", budgetUsd: -5 }));
  assert.deepEqual(loadSettings(f), DEFAULT_SETTINGS);
  assert.equal(SettingsSchema.safeParse({ tokenBudget: 1.5 }).success, false);
  assert.equal(SettingsSchema.safeParse({ budgetUsd: 1e9 }).success, false);
  assert.equal(readFileSync(`${f}.bak`, "utf8").includes("root"), true);
});

test("validateWorkspace: tolak root, home, folder data app, bukan folder, dan path relatif", () => {
  const home = tmp();
  const proj = join(home, "proyek");
  const data = join(home, "data");
  mkdirSync(proj); mkdirSync(data);
  const opts = { home, protectedDir: data };
  assert.equal(validateWorkspace(proj, opts), null);
  assert.match(validateWorkspace("/", opts)!, /terlalu luas/);
  assert.match(validateWorkspace(home, opts)!, /terlalu luas/);
  assert.match(validateWorkspace(data, opts)!, /menyimpan data/);
  assert.match(validateWorkspace(join(data, "state"), opts)!, /menyimpan data/);
  assert.match(validateWorkspace(join(home, "tidak-ada"), opts)!, /tidak ditemukan/);
  writeFileSync(join(home, "file.txt"), "x");
  assert.match(validateWorkspace(join(home, "file.txt"), opts)!, /Bukan folder/);
  assert.match(validateWorkspace("relatif/path", opts)!, /absolut/);
});

test("notifikasi: hanya running->done dan masuk error; budget sekali", () => {
  assert.equal(agentNote("running", agent({ status: "done" }))?.title, "Dax selesai");
  assert.equal(agentNote("idle", agent({ status: "done" })), null);
  assert.equal(agentNote("running", agent({ status: "running" })), null);
  const err = agentNote("running", agent({ status: "error", log: ["x", "[error] gagal total"] }));
  assert.deepEqual(err, { title: "Dax error", body: "gagal total" });
  assert.equal(agentNote("error", agent({ status: "error" })), null);
  const s = (spent: number) => ({ startedAt: 0, spent, budget: 100, costUsd: 0, budgetUsd: 0 });
  assert.equal(budgetNote(s(50), s(60)), null);
  assert.equal(budgetNote(s(90), s(120))?.title, "Budget tercapai");
  assert.equal(budgetNote(s(120), s(130)), null);
  assert.equal(budgetNote(undefined, { ...s(5), budget: 0 }), null);
});

test("isBusy: running atau punya antrean", () => {
  assert.equal(isBusy([agent(), agent({ status: "done" })]), false);
  assert.equal(isBusy([agent({ status: "running" })]), true);
  assert.equal(isBusy([agent({ queued: 2, paused: true, status: "paused" })]), true);
});

test("tokenStatus: kosong memblokir, terisi lolos", () => {
  assert.equal(tokenStatus("").loggedIn, false);
  assert.equal(tokenStatus("sk-ant-oat01-abc").loggedIn, true);
});

test("nickname: spasi dipangkas, kosong bawaan, lebih dari 40 karakter ditolak", () => {
  assert.equal(SettingsSchema.parse({}).nickname, "");
  assert.equal(SettingsSchema.parse({ nickname: "  Bimmo " }).nickname, "Bimmo");
  assert.equal(SettingsSchema.safeParse({ nickname: "x".repeat(41) }).success, false);
});
