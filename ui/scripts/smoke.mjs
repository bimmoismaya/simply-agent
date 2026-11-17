// Smoke test UI: jalankan server palsu + Vite, lalu kendalikan Chrome headless.
// Pakai: npm run smoke   (butuh Google Chrome; ubah lewat CHROME_PATH)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { coreChecks } from "./checks.mjs";

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = join(UI_DIR, "..", "server");
const OUT = join(UI_DIR, ".smoke");
const WS_PORT = 8799;
const UI_PORT = 5199;
const TOKEN = "smoke";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const children = [];
function start(cmd, args, cwd, env) {
  // detached: punya process group sendiri supaya bisa dimatikan beserta anaknya.
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  children.push({ child, log: () => out });
  return child;
}
function stopAll() {
  for (const { child } of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* sudah mati */ }
  }
}

const waitPort = (port, ms = 20000) => new Promise((res, rej) => {
  const end = Date.now() + ms;
  const tryOnce = () => {
    const s = connect(port, "127.0.0.1");
    s.once("connect", () => { s.destroy(); res(); });
    s.once("error", () => { s.destroy(); Date.now() > end ? rej(new Error(`port ${port} tidak terbuka`)) : setTimeout(tryOnce, 200); });
  };
  tryOnce();
});

const failures = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✔" : "✖"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  start("npx", ["tsx", "scripts/fake-server.ts"], SERVER_DIR, { PORT: String(WS_PORT), SIMPLY_TOKEN: TOKEN, UI_ORIGINS: `http://localhost:${UI_PORT}` });
  start("npx", ["vite", "--port", String(UI_PORT), "--strictPort"], UI_DIR, { VITE_WS_URL: `ws://127.0.0.1:${WS_PORT}` });
  await Promise.all([waitPort(WS_PORT), waitPort(UI_PORT)]);

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 960 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${UI_PORT}/?token=${TOKEN}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("live"), { timeout: 10000 });
  check("terhubung (live)", true);
  check("token dihapus dari address bar", !page.url().includes("token="), page.url());

  await coreChecks(page, check, OUT);

  const p2 = await browser.newPage();
  await p2.goto(`http://localhost:${UI_PORT}/`, { waitUntil: "networkidle0" });
  check("tanpa token: banner petunjuk tampil", !!(await p2.$('[role="alert"]')));

  check("tidak ada error di console", errors.length === 0, errors.join(" | "));
} catch (e) {
  failures.push(String(e));
  console.error(e);
  for (const c of children) console.error(c.log().slice(-1500));
} finally {
  await browser?.close();
  stopAll();
}

console.log(failures.length ? `\nGAGAL: ${failures.length} cek` : `\nSEMUA CEK LULUS. Screenshot di ${OUT}`);
process.exit(failures.length ? 1 : 0);
