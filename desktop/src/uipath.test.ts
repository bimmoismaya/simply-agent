import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { resolveUiFile } from "./uipath.ts";

// resolve() memberi path khas platform (Windows menambah huruf drive), jadi hasil yang diharapkan disusun dengan join().
const root = resolve("/opt/app/ui");

test("path normal dan root menjadi file di dalam folder UI", () => {
  assert.equal(resolveUiFile(root, "/"), join(root, "index.html"));
  assert.equal(resolveUiFile(root, "/assets/a.js"), join(root, "assets", "a.js"));
});

test("traversal dalam berbagai bentuk ditolak", () => {
  assert.equal(resolveUiFile(root, "/../../etc/passwd"), null);
  assert.equal(resolveUiFile(root, "/..%2f..%2fetc%2fpasswd"), null);
  assert.equal(resolveUiFile(root, "/%2e%2e%2f%2e%2e%2fetc%2fpasswd"), null);
  assert.equal(resolveUiFile(root, "/assets/../../secret"), null);
});

test("path absolut, NUL, dan encoding rusak tidak lolos", () => {
  // Garis miring di depan dibuang, jadi path absolut hanya menunjuk ke dalam folder UI.
  assert.equal(resolveUiFile(root, "/%2Fetc/passwd"), join(root, "etc", "passwd"));
  assert.equal(resolveUiFile(root, "/a%00b"), null);
  assert.equal(resolveUiFile(root, "/%E0%A4%A"), null);
});
