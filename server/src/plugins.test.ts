import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensurePlugins, isInstalled, PLUGINS, pluginDir, type PluginInfo } from "./plugins.ts";

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

// Repo plugin palsu lokal: tes tanpa internet.
function fakeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "plug-repo-"));
  mkdirSync(join(dir, ".claude-plugin"));
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), '{"name":"t"}');
  git(dir, "init", "-q");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x");
  return { dir, sha: git(dir, "rev-parse", "HEAD") };
}

test("katalog: id unik, SHA 40 hex, repo https", () => {
  assert.equal(new Set(PLUGINS.map((p) => p.id)).size, PLUGINS.length);
  for (const p of PLUGINS) {
    assert.match(p.sha, /^[0-9a-f]{40}$/);
    assert.match(p.repo, /^https:\/\/github\.com\//);
  }
});

test("ensurePlugins: unduh sekali, lalu dilewati tanpa jaringan; id asing diabaikan", async () => {
  const { dir, sha } = fakeRepo();
  const root = mkdtempSync(join(tmpdir(), "plug-root-"));
  const cat: PluginInfo[] = [{ id: "t", name: "t", desc: "", repo: dir, sha }];

  const r1 = await ensurePlugins(["t", "t", "asing"], root, cat);
  assert.deepEqual(r1.errors, {});
  assert.equal(r1.paths.length, 1);
  assert.ok(isInstalled(root, cat[0]));
  assert.ok(!existsSync(join(pluginDir(root, cat[0]), ".git")), ".git dibuang");

  rmSync(dir, { recursive: true, force: true }); // sumber hilang: yang terpasang tetap dipakai
  const r2 = await ensurePlugins(["t"], root, cat);
  assert.deepEqual(r2.errors, {});
  assert.deepEqual(r2.paths, r1.paths);
});

test("ensurePlugins: unduhan gagal dilaporkan, plugin lain tetap jalan", async () => {
  const good = fakeRepo();
  const root = mkdtempSync(join(tmpdir(), "plug-root-"));
  const cat: PluginInfo[] = [
    { id: "ok", name: "ok", desc: "", repo: good.dir, sha: good.sha },
    { id: "bad", name: "bad", desc: "", repo: join(tmpdir(), "tidak-ada-repo"), sha: "0".repeat(40) },
  ];
  const r = await ensurePlugins(["ok", "bad"], root, cat);
  assert.equal(r.paths.length, 1);
  assert.ok(r.errors.bad);
  assert.ok(!existsSync(`${pluginDir(root, cat[1])}.part-${process.pid}`), "sisa unduhan dibersihkan");
});
