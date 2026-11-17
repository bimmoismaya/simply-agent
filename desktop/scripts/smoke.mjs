// Smoke test app desktop: jalankan Electron (runner palsu), sambungkan Chrome DevTools Protocol,
// lalu pakai pemeriksaan UI yang sama dengan smoke web, ditambah keamanan jendela, pengaturan,
// satu instance, dan pemulihan sesi setelah restart.
// Pakai: npm run smoke   (di folder desktop)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import puppeteer from "puppeteer-core";
import { coreChecks } from "../../ui/scripts/checks.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(DIR, ".smoke");
const PORT = 9333;
const ENTRY = process.env.SMOKE_ENTRY ?? "dist/main.smoke.mjs";

const failures = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✔" : "✖"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Profil dan workspace sementara: smoke tidak boleh memakai atau mengubah data app yang sebenarnya,
// dan state sisa dari run sebelumnya tidak boleh membuat cek lulus secara kebetulan.
const TMP = mkdtempSync(join(tmpdir(), "engine-desktop-smoke-"));
const PROFILE = join(TMP, "profile");
const WORKSPACE = join(TMP, "workspace");

function spawnApp(extraEnv, debugPort) {
  const env = { ...process.env, SIMPLY_DEBUG_PORT: String(debugPort), SIMPLY_WORKSPACE: WORKSPACE, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE; // diwariskan terminal VS Code; membuat Electron jalan sebagai Node biasa
  const app = { log: "", exited: null, child: null };
  // CI Linux (AppArmor membatasi user namespace): sandbox Chromium tidak bisa dibuat, jadi dimatikan hanya untuk tes.
  const args = [ENTRY, `--user-data-dir=${PROFILE}`, ...(process.env.SMOKE_NO_SANDBOX ? ["--no-sandbox"] : [])];
  app.child = spawn(electron, args, { cwd: DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  app.child.stdout.on("data", (d) => { app.log += d; });
  app.child.stderr.on("data", (d) => { app.log += d; });
  app.child.on("exit", (code) => { app.exited = code; });
  return app;
}

async function attach(app, debugPort) {
  let browser;
  for (let i = 0; i < 100 && !browser; i++) {
    if (app.exited !== null) throw new Error(`Electron keluar (kode ${app.exited}) sebelum siap:\n${app.log.slice(-1500)}`);
    try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}`, defaultViewport: null }); }
    catch { await sleep(200); }
  }
  if (!browser) throw new Error("tidak bisa terhubung ke DevTools Electron");
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    page = (await browser.pages()).find((p) => p.url().startsWith("app://ui"));
    if (!page) await sleep(200);
  }
  if (!page) throw new Error(`jendela app://ui tidak ditemukan. Log:\n${app.log.slice(-1500)}`);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width: 1600, height: 960 });
  return { browser, page, errors };
}

const isLive = (page) => page.evaluate(() => document.querySelector('[role="status"]')?.textContent.includes("live")).catch(() => false);
async function waitLive(page, app) {
  for (let i = 0; i < 100 && !(await isLive(page)); i++) await sleep(150);
  if (!(await isLive(page))) throw new Error(`UI tidak pernah live. Log:\n${app.log.slice(-1200)}`);
}
const waitExit = async (app, ms) => { for (let i = 0; i < ms / 100 && app.exited === null; i++) await sleep(100); return app.exited !== null; };
const clickSidebar = (page, name) => page.evaluate((n) => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes(n)).click(), name);
const topText = (page) => page.$eval("header", (e) => e.textContent.replace(/\s+/g, " "));
const dialogOpen = (page) => page.$('[role="dialog"]').then(Boolean);

let app1, app2, b1, b2;
try {
  mkdirSync(OUT, { recursive: true });

  // =============== Fase A: sesi pertama ===============
  app1 = spawnApp({ SIMPLY_FAKE_AUTH: "out" }, PORT);
  const s1 = await attach(app1, PORT);
  b1 = s1.browser;
  const { page, errors } = s1;

  // Tunggu muat awal selesai (reload saat loadURL masih jalan membatalkannya dan app sengaja keluar).
  await waitLive(page, app1);

  // Pengaturan awal: profil baru langsung membuka dialog dengan pilihan plugin; Esc menutupnya tanpa menyimpan.
  const firstRun = await page.waitForSelector('[role="dialog"] [role="note"]', { timeout: 5000 }).then(() => true).catch(() => false);
  check("profil baru membuka pengaturan awal", firstRun);
  const pluginBoxes = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')].length);
  check("pengaturan awal menampilkan 8 plugin dan opsi notifikasi", pluginBoxes === 9, String(pluginBoxes));
  // Tanpa token Claude: bagian model hanya petunjuk, belum ada daftar agent.
  const hint = await page.$('[data-testid="models-hint"]').then(Boolean);
  const modelSelects = await page.$$eval('select[aria-label^="Model "]', (e) => e.length);
  check("tanpa token Claude: model per agent hanya petunjuk", hint && modelSelects === 0, `hint=${hint} select=${modelSelects}`);
  const navBefore = await page.$$eval("nav button", (e) => e.length);
  const emptyCard = await page.$('[data-testid="no-agents"]').then(Boolean);
  check("tanpa token: agent tidak ditampilkan, ada petunjuk", emptyCard && navBefore === 0, `kartu=${emptyCard} sidebar=${navBefore}`);
  // Pasang token Claude lewat UI, seperti pengguna sungguhan.
  await page.type('input[aria-label="Token claude"]', "token-uji");
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /^pasang$/i.test(b.textContent.trim())).click());
  await page.waitForSelector('select[aria-label="Model Dax"]', { timeout: 5000 });
  await page.click('input[aria-label="Batas biaya USD"]', { clickCount: 3 });
  await page.keyboard.type("1"); // Menyimpan menerapkan batas dari dialog; pertahankan batas uji $1.
  // Menyimpan menandai pengaturan awal selesai; tanpa itu dialog muncul lagi setiap halaman dimuat ulang.
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /^simpan$/i.test(b.textContent.trim())).click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 5000 }).catch(() => {});
  const shown = await page.waitForFunction(() => document.querySelectorAll("nav button").length === 8 && !document.querySelector('[data-testid="no-agents"]'), { timeout: 5000 }).then(() => true).catch(() => false);
  check("setelah token terpasang: 8 agent tampil", shown);
  check("simpan menutup pengaturan awal dan menandainya selesai", !(await dialogOpen(page)) && JSON.parse(readFileSync(join(PROFILE, "settings.json"), "utf8")).setupDone === true);

  // Banner login: cek pertama "belum login", tombol Cek ulang menghilangkannya.
  const banner = await page.waitForSelector('[data-testid="auth-banner"]', { timeout: 5000 }).then(() => true).catch(() => false);
  check("banner 'belum login ke Claude' tampil", banner);
  if (banner) {
    await page.evaluate(() => [...document.querySelectorAll('[data-testid="auth-banner"] button')].find((b) => /cek ulang/i.test(b.textContent)).click());
    const gone = await page.waitForFunction(() => !document.querySelector('[data-testid="auth-banner"]'), { timeout: 5000 }).then(() => true).catch(() => false);
    check("Cek ulang menghilangkan banner setelah login", gone);
  }

  // Muat ulang dari dalam halaman (page.reload milik Puppeteer terputus oleh protokol app://),
  // supaya listener error menangkap start UI.
  await page.evaluate(() => location.reload()).catch(() => {});
  await sleep(1200);
  await waitLive(page, app1);
  check("terhubung (live) lewat preload", true);
  check("halaman dimuat dari app://ui", page.url().startsWith("app://ui/"), page.url());
  check("token tidak ada di URL", !page.url().includes("token"), page.url());
  check("tray dibuat tanpa error", !app1.log.includes("tray tidak tersedia"), (app1.log.match(/tray tidak tersedia.*/) ?? [""])[0].slice(0, 100));

  // Keamanan jendela.
  const surface = await page.evaluate(() => ({
    require: typeof globalThis.require,
    process: typeof globalThis.process,
    bridgeKeys: Object.keys(window.simply ?? {}).sort(),
  }));
  check("renderer tidak punya require/process (tanpa akses Node)", surface.require === "undefined" && surface.process === "undefined", JSON.stringify(surface));
  const expectedKeys = ["authStatus", "chooseWorkspace", "claudeInfo", "connection", "getSettings", "onOpenSettings", "saveSettings", "setToken"];
  check("jembatan preload hanya menyediakan 8 fungsi yang direncanakan", surface.bridgeKeys.join() === expectedKeys.join(), surface.bridgeKeys.join());

  // CSP dibuktikan lewat pelanggaran sungguhan: fetch ke luar harus ditolak oleh connect-src, bukan oleh jaringan.
  const violation = await page.evaluate(() => new Promise((res) => {
    document.addEventListener("securitypolicyviolation", (e) => res(e.violatedDirective), { once: true });
    fetch("https://example.com/").catch(() => {});
    setTimeout(() => res("tidak ada pelanggaran"), 2000);
  }));
  check("CSP memblokir koneksi ke situs luar (connect-src)", String(violation).startsWith("connect-src"), String(violation));
  // Kode lewat DevTools dikecualikan dari CSP, jadi eval tidak bisa diuji dari sini. Skrip inline (jalur XSS) bisa.
  const inline = await page.evaluate(() => new Promise((res) => {
    document.addEventListener("securitypolicyviolation", (e) => res(e.violatedDirective), { once: true });
    const el = document.createElement("script");
    el.textContent = "window.__inlineRan = true";
    document.head.appendChild(el);
    setTimeout(() => res("tidak ada pelanggaran"), 2000);
  }));
  const inlineRan = await page.evaluate(() => window.__inlineRan === true);
  check("CSP memblokir skrip inline", String(inline).startsWith("script-src") && !inlineRan, `${inline}, berjalan=${inlineRan}`);

  const blocked = await page.evaluate(async () => {
    const before = location.href;
    const w = window.open("https://example.com", "_blank");
    return { opened: !!w, still: location.href === before };
  });
  check("window.open ke luar ditolak", !blocked.opened && blocked.still, JSON.stringify(blocked));
  await page.evaluate(() => { location.href = "https://example.com/"; });
  await sleep(600);
  check("navigasi ke situs luar diblokir", page.url().startsWith("app://ui"), page.url());

  // Token salah ditolak server.
  const connInfo = await page.evaluate(() => window.simply.connection());
  const wsStatus = (url) => page.evaluate((u) => new Promise((res) => {
    const s = new WebSocket(u);
    s.onopen = () => { s.close(); res("open"); };
    s.onerror = () => res("ditolak");
  }), url);
  check("WebSocket dengan token salah ditolak", (await wsStatus(`${connInfo.url}/?token=salah`)) === "ditolak");
  check("WebSocket dengan token benar diterima", (await wsStatus(`${connInfo.url}/?token=${connInfo.token}`)) === "open");

  // Satu instance: proses kedua dengan profil yang sama harus keluar sendiri, dan yang pertama tetap hidup.
  const second = spawnApp({}, PORT + 11);
  const secondExited = await waitExit(second, 10000);
  check("instance kedua langsung keluar (satu instance saja)", secondExited && second.exited === 0, `exit=${second.exited}`);
  check("instance pertama tetap hidup setelah itu", app1.exited === null && (await isLive(page)));
  if (!secondExited) second.child.kill("SIGTERM");

  // Probe di atas sengaja memicu error konsol (CSP dan token salah); hitung error hanya dari sini.
  errors.length = 0;
  await coreChecks(page, check, OUT);

  // ---- Pengaturan ----
  await page.keyboard.press("Escape"); // tutup drawer sisa coreChecks
  await sleep(200);
  const openSettings = () => page.evaluate(() => document.querySelector('button[aria-label="Pengaturan"]').click());
  await openSettings();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  const wsShown = await page.$eval('[data-testid="workspace-path"]', (e) => e.textContent);
  check("dialog Pengaturan menampilkan workspace", wsShown === WORKSPACE, wsShown);
  const dialogText = await page.$eval('[role="dialog"]', (e) => e.textContent);
  check("workspace terkunci env ditandai di dialog", dialogText.includes("SIMPLY_WORKSPACE"));
  await page.keyboard.press("Escape");
  await sleep(200);
  check("Esc menutup dialog Pengaturan", !(await dialogOpen(page)));

  // Validasi di proses utama (bukan hanya di UI).
  const cur = await page.evaluate(() => window.simply.getSettings());
  const bad1 = await page.evaluate((c) => window.simply.saveSettings({ ...c.settings, toolMode: "root" }), cur);
  check("simpan dengan toolMode tidak valid ditolak", bad1.ok === false, JSON.stringify(bad1));
  const bad2 = await page.evaluate((c) => window.simply.saveSettings({ ...c.settings, budgetUsd: -1 }), cur);
  check("simpan dengan budget negatif ditolak", bad2.ok === false, JSON.stringify(bad2));
  const bad3 = await page.evaluate((c) => window.simply.saveSettings({ ...c.settings, workspace: "/" }), cur);
  check("ganti workspace saat terkunci env ditolak", bad3.ok === false && /dikunci/i.test(bad3.error), JSON.stringify(bad3));
  const unchanged = await page.evaluate(() => window.simply.getSettings());
  check("pengaturan tidak berubah setelah simpan ditolak", JSON.stringify(unchanged.settings) === JSON.stringify(cur.settings));

  // Setelah token Claude diisi, dropdown berisi model dari provider (di smoke: daftar palsu).
  await page.evaluate(() => window.simply.setToken("claude", "token-uji"));
  await openSettings();
  await page.waitForSelector('select[aria-label="Model Dax"]', { timeout: 5000 });
  const opts = await page.$$eval('select[aria-label="Model Dax"] option', (o) => o.map((x) => x.value));
  check("dengan token Claude: dropdown berisi model dari provider", opts.join() === "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5", opts.join());
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 3000 }).catch(() => {});

  // Ubah lewat UI: mode baca+tulis, budget USD 2.5, model Dax ke Haiku.
  await openSettings();
  await page.waitForSelector('[role="dialog"]');
  await page.evaluate(() => [...document.querySelectorAll('input[name="toolMode"]')][1].click());
  const warn = await page.waitForSelector('[role="note"]', { timeout: 3000 }).then(() => true).catch(() => false);
  check("mode baca+tulis menampilkan peringatan sandbox", warn);
  await page.click('input[aria-label="Batas biaya USD"]');
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.type("2.5");
  await page.select('select[aria-label="Model Dax"]', "claude-haiku-5-5");
  await page.type('input[aria-label="Nama panggilan"]', "Uji");
  await page.screenshot({ path: join(OUT, "4-pengaturan.png") });
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /simpan/i.test(b.textContent)).click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 5000 });
  check("simpan menutup dialog", !(await dialogOpen(page)));
  await sleep(300);
  check("budget baru langsung tampil di bar atas (tanpa restart)", (await topText(page)).includes("$2.50"), (await topText(page)).slice(-40));
  const daxRow = await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes("Dax")).textContent);
  check("model Dax berubah ke Haiku di sidebar", daxRow.includes("claude-haiku-5-5"), daxRow);
  const saved = JSON.parse(readFileSync(join(PROFILE, "settings.json"), "utf8"));
  check("sapaan nama panggilan tampil di halaman utama", (await page.evaluate(() => document.querySelector('[data-testid="info-account"]')?.textContent ?? "")).includes("Halo, Uji"));
  check("pengaturan tersimpan di folder data pengguna", saved.toolMode === "all" && saved.budgetUsd === 2.5 && saved.models.dax === "claude-haiku-5-5", JSON.stringify(saved).slice(0, 120));
  check("state engine ada di folder data pengguna", existsSync(join(PROFILE, "state", "state.json")));
  check("tidak ada state di dalam workspace agent", !existsSync(join(WORKSPACE, ".engine")));

  const infoBar = await page.evaluate(() => document.querySelector('[data-testid="info-bar"]')?.textContent ?? "");
  const acct = await page.evaluate(() => document.querySelector('[data-testid="info-account"]')?.textContent ?? "");
  check("halaman utama menampilkan akun yang terhubung dengan token", acct.includes("uji@contoh.test") && acct.includes("Org Uji") && acct.includes("max"), acct);
  check("halaman utama menampilkan AI dan folder", infoBar.includes("claude") && infoBar.includes(WORKSPACE), infoBar.slice(0, 120));

  // Plugin: id di luar katalog dibuang, tidak pernah dipakai sebagai URL atau path.
  const cur2 = await page.evaluate(() => window.simply.getSettings());
  const pr = await page.evaluate((c) => window.simply.saveSettings({ ...c.settings, plugins: ["asing", "../etc"] }), cur2);
  check("plugin di luar katalog dibuang saat simpan", pr.ok === true && JSON.parse(readFileSync(join(PROFILE, "settings.json"), "utf8")).plugins.length === 0);

  // Token provider: tersimpan di settings.json, tidak pernah dikembalikan ke UI, input aneh ditolak.
  const t1 = await page.evaluate(() => window.simply.setToken("codex", "sk-rahasia-123"));
  const t2 = await page.evaluate(() => window.simply.setToken("codex", "ada spasi"));
  const t3 = await page.evaluate(() => window.simply.setToken("openai", "x"));
  const info = await page.evaluate(() => window.simply.getSettings());
  check("token provider tersimpan", t1.ok === true && JSON.parse(readFileSync(join(PROFILE, "settings.json"), "utf8")).tokens.codex === "sk-rahasia-123");
  check("token tidak dikirim balik ke UI", !JSON.stringify(info).includes("sk-rahasia") && info.tokenSet.codex === true && info.tokenSet.gemini === false);
  check("token dengan spasi atau provider asing ditolak", t2.ok === false && t3.ok === false);
  await page.evaluate(() => window.simply.setToken("codex", ""));

  check("tidak ada error di console", errors.length === 0, errors.join(" | "));

  // Tutup rapi: proses Electron berhenti sendiri setelah jendela ditutup (agent sedang idle, jadi tanpa dialog).
  await page.evaluate(() => window.close());
  check("menutup jendela menghentikan app", await waitExit(app1, 10000));
  await b1.disconnect();
  b1 = null;

  // =============== Fase B: restart dengan profil yang sama ===============
  app2 = spawnApp({}, PORT);
  const s2 = await attach(app2, PORT);
  b2 = s2.browser;
  await waitLive(s2.page, app2);
  const back = await s2.page.evaluate(() => window.simply.getSettings());
  check("restart: pengaturan dipulihkan", back.settings.toolMode === "all" && back.settings.budgetUsd === 2.5 && back.settings.models.dax === "claude-haiku-5-5");
  await s2.page.waitForSelector(".react-flow__node-agent");
  const daxRow2 = await s2.page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes("Dax")).textContent);
  check("restart: model Dax tetap Haiku", daxRow2.includes("claude-haiku-5-5"), daxRow2);
  await clickSidebar(s2.page, "Pip");
  await sleep(300);
  const pipDrawer = await s2.page.$eval("aside", (e) => e.textContent);
  check("restart: log sesi sebelumnya dipulihkan", pipDrawer.includes("cek login"));
  check("restart: biaya sesi sebelumnya dipulihkan", /\$0\.00\d/.test(pipDrawer));
  await s2.page.screenshot({ path: join(OUT, "5-restart.png") });
  await s2.page.evaluate(() => window.close());
  check("restart: menutup jendela menghentikan app", await waitExit(app2, 10000));
} catch (e) {
  failures.push(String(e));
  console.error(e);
} finally {
  await b1?.disconnect();
  await b2?.disconnect();
  for (const a of [app1, app2]) if (a && a.exited === null) a.child.kill("SIGTERM");
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures.length ? `\nGAGAL: ${failures.length} cek` : `\nSEMUA CEK LULUS. Screenshot di ${OUT}`);
process.exit(failures.length ? 1 : 0);
