import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanToken, shapeProblem } from "../../shared/tokens.ts";
import { validateProviderToken } from "./tokens.ts";

test("cleanToken: spasi ujung dan awalan Bearer dibuang", () => {
  assert.equal(cleanToken("  abc\n"), "abc");
  assert.equal(cleanToken("Bearer abc"), "abc");
  assert.equal(cleanToken("bearer   abc "), "abc");
});

test("shapeProblem: kode browser, URL, API key Anthropic, spasi ditandai; token biasa dan kosong lolos", () => {
  assert.match(shapeProblem("claude", "Kyel#Xacn")!, /kode dari halaman browser/);
  assert.match(shapeProblem("claude", "sk-ant-api03-abc")!, /API key Anthropic/);
  assert.match(shapeProblem("claude", "https://platform.claude.com/oauth/code/callback?code=x")!, /alamat/);
  assert.match(shapeProblem("codex", "ada spasi")!, /spasi/);
  assert.equal(shapeProblem("claude", "token-biasa-tanpa-spasi"), null);
  assert.equal(shapeProblem("codex", "sk-proj-abc#123"), null, "'#' hanya dicurigai untuk Claude");
  assert.equal(shapeProblem("claude", "   "), null, "kosong = hapus token");
});

const reply = (status: number) => async () => ({ status });

test("validateProviderToken: OpenAI 200 valid, 401 ditolak, 429 dan jaringan tak pasti", async () => {
  assert.equal((await validateProviderToken("codex", "k", reply(200))).state, "valid");
  assert.equal((await validateProviderToken("codex", "k", reply(401))).state, "rejected");
  assert.equal((await validateProviderToken("codex", "k", reply(429))).state, "unknown");
  assert.equal((await validateProviderToken("codex", "k", async () => { throw new Error("offline"); })).state, "unknown");
});

test("validateProviderToken: Gemini 400 ditolak; key lewat header, bukan URL; provider asing tak pasti", async () => {
  const seen: { url?: string; headers?: Record<string, string> } = {};
  const spy = async (url: string, init: { headers: Record<string, string> }) => { seen.url = url; seen.headers = init.headers; return { status: 400 }; };
  const r = await validateProviderToken("gemini", "AIzaRAHASIA", spy);
  assert.equal(r.state, "rejected");
  assert.ok(!seen.url!.includes("AIzaRAHASIA"), "key tidak boleh ada di URL");
  assert.equal(seen.headers!["x-goog-api-key"], "AIzaRAHASIA");
  assert.equal((await validateProviderToken("claude", "k", reply(200))).state, "unknown");
});
