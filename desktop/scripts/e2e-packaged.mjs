// E2E app jadi dengan agent SUNGGUHAN (memakai token akun Claude Anda).
// Membuktikan binary `claude` di dalam paket bisa dijalankan.
//
// Pakai:
//   node scripts/e2e-packaged.mjs [path-app]                  satu tugas pendek (sekitar USD 0,02)
//   node scripts/e2e-packaged.mjs [path-app] --bash-sandbox   ditambah uji sandbox Bash (sekitar USD 0,05 lagi)
//
// path-app bawaan: release/linux-unpacked/simply-agent. Untuk app terpasang: /opt/simply-agent/simply-agent
// Memakai profil dan workspace sementara; data app yang sebenarnya tidak disentuh. Jangan dimasukkan ke `smoke`.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bashTest = args.includes("--bash-sandbox");
const APP = args.find((a) => !a.startsWith("--")) ?? join(DIR, "release/linux-unpacked/simply-agent");
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUTSIDE = join(homedir(), "engine-escape-test.txt");

const TMP = mkdtempSync(join(tmpdir(), "engine-e2e-"));
const PROFILE = join(TMP, "profile");
const WORKSPACE = join(TMP, "workspace");
mkdirSync(PROFILE, { recursive: true });
mkdirSync(WORKSPACE, { recursive: true });
rmSync(OUTSIDE, { force: true });

if (bashTest) {
  // Mode baca+tulis supaya Bash aktif, dan skrip yang mencoba lolos dari workspace.
  writeFileSync(join(PROFILE, "settings.json"), JSON.stringify({ toolMode: "all" }));
  writeFileSync(join(WORKSPACE, "escape.js"), `const fs = require("fs"), os = require("os"), path = require("path");
const t = (label, fn) => { try { console.log(label, fn()); } catch (e) { console.log(label, "BLOCKED", e.code); } };
t("OUTSIDE_WRITE", () => { fs.writeFileSync(path.join(os.homedir(), "engine-escape-test.txt"), "x"); return "ESCAPED"; });
t("INSIDE_WRITE", () => { fs.writeFileSync(path.join(__dirname, "inside.txt"), "x"); return "OK"; });
t("SECRET_READ", () => "READABLE len=" + fs.readFileSync(path.join(os.homedir(), ".claude/.credentials.json"), "utf8").length);
`);
}

const env = { ...process.env, SIMPLY_WORKSPACE: WORKSPACE };
delete env.ELECTRON_RUN_AS_NODE;
let out = "";
const child = spawn(APP, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], { env, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });
let exited = null;
child.on("exit", (c) => { exited = c; });

const ok = (m) => console.log(`✔ ${m}`);
const bad = (m) => console.log(`✖ ${m}`);
let code = 1;
let browser;

async function runTask(page, agent, text, maxSeconds = 150) {
  // Fokus langsung: menekan "/" saat kolom perintah sudah terfokus justru mengetik karakter "/".
  await page.focus("#command");
  await page.keyboard.type(`@${agent} ${text}`);
  await page.keyboard.press("Enter");
  const row = () => page.evaluate((n) => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes(n))?.textContent ?? "", agent);
  let last = "";
  for (let i = 0; i < maxSeconds * 2; i++) {
    last = await row();
    if (/done|error/.test(last)) break;
    await sleep(500);
  }
  await page.evaluate((n) => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes(n)).click(), agent);
  await sleep(400);
  return { status: last, log: await page.$eval("aside", (e) => e.textContent) };
}

try {
  if (!existsSync(APP)) throw new Error(`app tidak ditemukan: ${APP}`);
  for (let i = 0; i < 100 && !browser; i++) {
    if (exited !== null) throw new Error(`app keluar (kode ${exited}):\n${out.slice(-1500)}`);
    try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch { await sleep(200); }
  }
  let page;
  for (let i = 0; i < 50 && !page; i++) { page = (await browser.pages()).find((p) => p.url().startsWith("app://ui")); if (!page) await sleep(200); }
  if (!page) throw new Error("jendela app://ui tidak ditemukan");
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("live"), { timeout: 20000 });
  ok(`app terbuka dan live (${APP})`);

  // Agent butuh token provider (diisi di Pengaturan app terpasang); tanpa itu info akun gagal.
  const info = await page.evaluate(() => window.simply.claudeInfo());
  info.ok ? ok(`token Claude terisi, akun terhubung (${info.account.plan ?? "?"})`) : bad(`token Claude: ${info.error}. Isi token di Pengaturan app dulu.`);

  const r = await runTask(page, "Otto", "Reply with exactly: PACKED_OK");
  const pass = r.log.includes("PACKED_OK") && /done/.test(r.status);
  pass ? ok("agent sungguhan membalas dari dalam paket (binary claude berjalan)") : bad(`tugas gagal. status: ${r.status}\n${r.log.slice(0, 800)}`);
  console.log("  biaya/token:", (r.log.match(/\d+ tok · \$[\d.]+/) ?? ["?"])[0]);
  code = pass ? 0 : 1;

  if (bashTest) {
    const k = await runTask(page, "Ken", "Run this exact Bash command and paste its full output verbatim: node escape.js");
    const escaped = existsSync(OUTSIDE);
    const sawBlocked = /OUTSIDE_WRITE\s+BLOCKED/.test(k.log);
    const sandboxErr = /apply-seccomp|userns|sandbox/i.test(k.log) && !/OUTSIDE_WRITE/.test(k.log);
    if (escaped) { bad("BAHAYA: skrip berhasil menulis di luar workspace"); code = 1; }
    else if (sawBlocked) { ok("sandbox Bash BEKERJA: tulis ke luar workspace diblokir"); }
    else if (sandboxErr) { ok("sandbox Bash gagal-tertutup (tidak ada yang lolos), tapi Bash tidak bisa dipakai di mesin ini"); }
    else { bad(`hasil sandbox tidak jelas:\n${k.log.slice(0, 900)}`); code = 1; }
    console.log("  cuplikan:", k.log.split("\n").filter((l) => /BLOCKED|OK|READABLE|ESCAPED|sandbox|seccomp/i.test(l)).slice(0, 4).join(" | "));
  }
  await page.evaluate(() => window.close()).catch(() => {});
} catch (e) {
  console.error(e);
} finally {
  await browser?.disconnect();
  await sleep(1000);
  if (exited === null) child.kill("SIGTERM");
  rmSync(TMP, { recursive: true, force: true });
  rmSync(OUTSIDE, { force: true });
}
process.exit(code);
