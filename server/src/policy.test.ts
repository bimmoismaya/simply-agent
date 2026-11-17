import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkTool } from "./policy.ts";

const ws = mkdtempSync(join(tmpdir(), "policy-"));
mkdirSync(join(ws, "src"));
const ok = (d: ReturnType<typeof checkTool>) => assert.equal(d.allow, true, d.allow ? "" : d.reason);
const no = (d: ReturnType<typeof checkTool>) => assert.equal(d.allow, false);

test("baca di dalam workspace diizinkan, di luar ditolak", () => {
  ok(checkTool("Read", { file_path: join(ws, "src/a.ts") }, ws, false));
  ok(checkTool("Read", { file_path: "src/a.ts" }, ws, false));
  no(checkTool("Read", { file_path: "/etc/passwd" }, ws, false));
  no(checkTool("Read", { file_path: "../secret" }, ws, false));
  no(checkTool("Grep", { pattern: "x", path: "/home" }, ws, false));
  no(checkTool("Glob", { pattern: "../**/*.ts" }, ws, false));
});

test("symlink yang menunjuk ke luar workspace ditolak", () => {
  // Target nyata di luar workspace. "junction" dipakai di Windows (symlink biasa butuh hak admin); di POSIX diabaikan.
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  writeFileSync(join(outside, "passwd"), "x");
  symlinkSync(outside, join(ws, "keluar"), "junction");
  no(checkTool("Read", { file_path: "keluar/passwd" }, ws, false));
});

test("tulis butuh AGENT_TOOLS=all dan tetap dibatasi workspace", () => {
  no(checkTool("Write", { file_path: "src/b.ts" }, ws, false));
  ok(checkTool("Write", { file_path: "src/b.ts" }, ws, true));
  no(checkTool("Edit", { file_path: "/tmp/x" }, ws, true));
});

test("Bash: mati default, allowlist, tanpa perangkai perintah", () => {
  no(checkTool("Bash", { command: "ls" }, ws, false));
  ok(checkTool("Bash", { command: "npm test" }, ws, true));
  no(checkTool("Bash", { command: "rm -rf src" }, ws, true));
  no(checkTool("Bash", { command: "ls; rm -rf /" }, ws, true));
  no(checkTool("Bash", { command: "cat $(echo /etc/passwd)" }, ws, true));
  no(checkTool("Bash", { command: "cat ../../.ssh/id_rsa" }, ws, true));
  no(checkTool("Bash", { command: "cat /etc/passwd" }, ws, true));
});

test("tool jaringan dan tool tak dikenal ditolak default", () => {
  no(checkTool("WebFetch", { url: "https://x" }, ws, false));
  ok(checkTool("WebFetch", { url: "https://x" }, ws, true));
  no(checkTool("mcp__evil__run", {}, ws, true));
  ok(checkTool("TodoWrite", {}, ws, false));
  ok(checkTool("Skill", { skill: "humanizer" }, ws, false));
  no(checkTool("mcp__rea__open_binary", {}, ws, true));
});

test("tool engine hanya lolos kalau ada di extraAllowed", () => {
  no(checkTool("mcp__simply__delegate", { to: "Dax", task: "x" }, ws, false));
  ok(checkTool("mcp__simply__delegate", { to: "Dax", task: "x" }, ws, false, undefined, ["mcp__simply__delegate"]));
});
