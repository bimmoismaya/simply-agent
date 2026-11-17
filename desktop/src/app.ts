import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, session, Tray,
} from "electron";
import type { AgentStatus, SessionInfo } from "../../shared/types.ts";
import { startServer } from "../../server/src/index.ts";
import { defaultRunner, type Limits, type Runner } from "../../server/src/engine.ts";
import { ensurePlugins, isInstalled, PLUGINS } from "../../server/src/plugins.ts";
import { TOKEN_ENV, tokenStatus, type AuthStatus } from "./auth.ts";
import { agentNote, budgetNote, isBusy } from "./notify.ts";
import { defaultWorkspace, loadSettings, PROVIDERS, saveSettings, SettingsSchema, validateWorkspace, type Settings } from "./settings.ts";
import { resolveUiFile } from "./uipath.ts";

export interface LaunchOptions {
  /** Untuk smoke test: ganti agent sungguhan dengan runner palsu. */
  runner?: Runner;
  limits?: Limits;
  /** Untuk smoke test: ganti pengecekan token Claude. */
  authCheck?: () => Promise<AuthStatus>;
  /** Untuk smoke test: buka port DevTools protocol (hanya di localhost). Tidak pernah diisi di app biasa. */
  debugPort?: number;
}

const SCHEME = "app";
const HOST = "ui";
const ORIGIN = `${SCHEME}://${HOST}`;
const APP_NAME = "Simply Agent";

// Halaman hanya boleh memuat dirinya sendiri, font Google, dan terhubung ke server lokal.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

const here = dirname(fileURLToPath(import.meta.url));

// Wajib dipanggil sebelum app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Layani file UI dari folder `ui/` hasil build. Path di luar folder itu ditolak. */
function serveUi(uiDir: string) {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response("not found", { status: 404 });
    const file = resolveUiFile(uiDir, url.pathname);
    if (!file) return new Response("forbidden", { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", CSP);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(res.body, { status: res.status, headers });
  });
}

/**
 * Di app jadi, binary `claude` milik SDK ada di luar asar (asarUnpack) dan harus dialamatkan eksplisit:
 * path bawaan SDK menunjuk ke dalam app.asar, yang tidak bisa dieksekusi.
 */
function pointToBundledClaude() {
  if (!app.isPackaged || process.env.CLAUDE_CODE_EXECUTABLE) return;
  const dir = join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@anthropic-ai", `claude-agent-sdk-${process.platform}-${process.arch}`);
  // Windows memakai claude.exe; nama lain dicoba dulu supaya tidak bergantung pada satu ejaan.
  const bin = ["claude", "claude.exe"].map((n) => join(dir, n)).find((f) => existsSync(f));
  if (!bin) throw new Error(`binary claude tidak ada di paket: ${dir}`);
  process.env.CLAUDE_CODE_EXECUTABLE = bin;
}

export async function launch(opts: LaunchOptions = {}) {
  if (opts.debugPort) app.commandLine.appendSwitch("remote-debugging-port", String(opts.debugPort));
  // Lokasi data tetap, tidak bergantung pada nama paket. --user-data-dir (dipakai tes) tetap menang.
  if (!app.commandLine.hasSwitch("user-data-dir")) {
    const appData = app.getPath("appData");
    app.setPath("userData", join(appData, "simply-agent"));
    // Nama lama: pindahkan data (pengaturan, token, state) sekali supaya tidak hilang.
    const legacy = join(appData, "agent-orchestrator");
    if (existsSync(legacy) && !existsSync(join(appData, "simply-agent"))) {
      try { renameSync(legacy, join(appData, "simply-agent")); } catch (e) { console.warn("migrasi data lama gagal:", e); }
    }
  }

  // Satu instance saja: instance kedua langsung keluar dan instance pertama difokuskan.
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
    return null;
  }

  await app.whenReady();
  app.setName(APP_NAME);
  pointToBundledClaude();

  const userData = app.getPath("userData");
  const settingsFile = join(userData, "settings.json");
  let settings: Settings = loadSettings(settingsFile);

  // Mode dev: muat dari Vite. Tidak ada CSP di sini karena HMR butuh eval.
  const devUrl = process.env.SIMPLY_DEV_URL;
  const uiDir = process.env.SIMPLY_UI_DIR ?? join(here, "ui");
  const allowedOrigins = [ORIGIN, ...(devUrl ? [new URL(devUrl).origin] : [])];
  if (!devUrl) serveUi(uiDir);

  // SIMPLY_WORKSPACE (env) mengunci workspace: dipakai tes dan pengembangan.
  const envWorkspace = process.env.SIMPLY_WORKSPACE ?? null;
  const fallbackWorkspace = defaultWorkspace(userData);
  let workspace = envWorkspace ?? settings.workspace ?? fallbackWorkspace;
  if (!envWorkspace && settings.workspace && validateWorkspace(settings.workspace, { protectedDir: userData })) {
    console.warn(`workspace tersimpan tidak valid (${settings.workspace}), memakai folder bawaan`);
    workspace = fallbackWorkspace;
  }
  mkdirSync(workspace, { recursive: true });

  // Mode tool dibaca provider per giliran, jadi perubahan dari Pengaturan langsung berlaku.
  const applyToolMode = (s: Settings) => { process.env.AGENT_TOOLS = s.toolMode === "all" ? "all" : ""; };
  applyToolMode(settings);

  // Token tiap provider diisi manual di Pengaturan dan dipakai lewat env oleh CLI-nya (menang atas login ~/.claude).
  const applyTokens = (s: Settings) => {
    for (const p of PROVIDERS) {
      if (s.tokens[p]) process.env[TOKEN_ENV[p]] = s.tokens[p];
      else delete process.env[TOKEN_ENV[p]];
    }
  };
  applyTokens(settings);
  // Plugin: pastikan pilihan terpasang (unduh kalau belum), lalu beri tahu provider lewat env. Dipanggil juga sebelum tiap giliran agent.
  const pluginRoot = join(userData, "plugins");
  const preparePlugins = async () => {
    const r = await ensurePlugins(settings.plugins, pluginRoot);
    process.env.AGENT_PLUGINS = r.paths.join(delimiter);
    for (const [id, msg] of Object.entries(r.errors)) console.warn(`plugin ${id} gagal diunduh: ${msg}`);
    return r.errors;
  };

  // Tanpa token, agent provider itu gagal dengan pesan jelas, bukan jatuh ke login CLI.
  const gatedRunner: Runner = (cfg, task, ctx) => {
    if (!settings.tokens[cfg.provider]) {
      return Promise.reject(new Error(`Token ${cfg.provider} belum diisi. Buka Pengaturan dan tempel token.`));
    }
    // Gagal unduh plugin tidak menghentikan agent; ia jalan tanpa plugin itu.
    return preparePlugins().then(() => defaultRunner(cfg, task, ctx));
  };

  const limitsOf = (s: Settings): Limits => ({ tokens: s.tokenBudget, usd: s.budgetUsd });

  // Token dibuat tiap start dan hanya lewat IPC ke jendela kita; tidak pernah ada di URL.
  const token = randomBytes(16).toString("hex");
  const server = startServer({
    port: 0, workspace, token, origins: allowedOrigins, runner: opts.runner ?? gatedRunner,
    limits: opts.limits ?? limitsOf(settings),
    stateDir: join(userData, "state"),
    models: settings.models,
  });
  const port = await server.ready;
  const engine = server.engine;

  const authCheck = opts.authCheck ?? (async () => tokenStatus(settings.tokens.claude ?? ""));
  let win: BrowserWindow;
  let tray: Tray | null = null;
  let quitting = false;

  const showWindow = () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  // ---- IPC (semua pengirim divalidasi) ----
  const guarded = (channel: string, fn: (arg: unknown) => unknown) =>
    ipcMain.handle(channel, (event, arg) => {
      const sender = event.senderFrame?.url ?? "";
      if (!allowedOrigins.some((o) => sender.startsWith(o))) throw new Error("pengirim tidak diizinkan");
      return fn(arg);
    });

  guarded("simply:connection", () => ({ url: `ws://127.0.0.1:${port}`, token }));

  guarded("simply:getSettings", () => ({
    // Token tidak pernah dikirim ke UI; hanya penanda sudah terisi.
    settings: { ...settings, tokens: {} },
    tokenSet: Object.fromEntries(PROVIDERS.map((p) => [p, !!settings.tokens[p]])),
    effectiveWorkspace: workspace,
    workspaceLocked: envWorkspace !== null,
    defaultWorkspace: fallbackWorkspace,
    platform: process.platform,
    plugins: PLUGINS.map((p) => ({ id: p.id, name: p.name, desc: p.desc, warn: p.warn ?? null, installed: isInstalled(pluginRoot, p) })),
  }));

  guarded("simply:chooseWorkspace", async () => {
    const r = await dialog.showOpenDialog(win, {
      title: "Pilih folder workspace",
      defaultPath: workspace,
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const error = validateWorkspace(r.filePaths[0], { protectedDir: userData });
    return error ? { error } : { path: r.filePaths[0] };
  });

  guarded("simply:saveSettings", async (arg) => {
    const parsed = SettingsSchema.safeParse(arg);
    if (!parsed.success) return { ok: false, error: "Pengaturan tidak valid." };
    const next = { ...parsed.data, tokens: settings.tokens, plugins: parsed.data.plugins.filter((id) => PLUGINS.some((p) => p.id === id)) };
    if (envWorkspace && next.workspace !== settings.workspace) return { ok: false, error: "Workspace dikunci oleh SIMPLY_WORKSPACE." };
    if (next.workspace) {
      const error = validateWorkspace(next.workspace, { protectedDir: userData });
      if (error) return { ok: false, error };
    }
    const workspaceChanged = (next.workspace ?? fallbackWorkspace) !== (settings.workspace ?? fallbackWorkspace);
    saveSettings(settingsFile, next);
    settings = next;
    applyToolMode(next);
    engine.configure({ limits: limitsOf(next), models: next.models });
    // Unduh plugin terpilih sekarang, supaya kegagalan terlihat di dialog dan bukan saat agent jalan.
    const pluginErrors = await preparePlugins();
    // Workspace dipakai sebagai cwd semua agent dan state server, jadi perubahan butuh mulai ulang.
    if (workspaceChanged) {
      setTimeout(() => { app.relaunch(); app.quit(); }, 400);
      return { ok: true, restart: true, pluginErrors };
    }
    return { ok: true, restart: false, pluginErrors };
  });

  guarded("simply:setToken", (arg) => {
    const a = arg as { provider?: unknown; token?: unknown } | null;
    const provider = PROVIDERS.find((p) => p === a?.provider);
    const t = typeof a?.token === "string" ? a.token.trim() : null;
    if (!provider || t === null || t.length > 2000 || /\s/.test(t)) return { ok: false, error: "Token tidak valid." };
    const next = { ...settings, tokens: { ...settings.tokens, [provider]: t } };
    if (!t) delete next.tokens[provider];
    saveSettings(settingsFile, next);
    settings = next;
    applyTokens(next);
    return { ok: true };
  });

  guarded("simply:authStatus", () => authCheck());

  // ---- Keamanan jendela ----
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-attach-webview", (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    const guard = (e: Electron.Event, url: string) => {
      if (!allowedOrigins.some((o) => url.startsWith(o))) e.preventDefault();
    };
    contents.on("will-navigate", guard);
    contents.on("will-redirect", guard);
  });

  const iconPath = join(here, "assets", "icon.png");
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#07070a",
    title: APP_NAME,
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  win.once("ready-to-show", () => win.show());

  // ---- Menu aplikasi ----
  const openSettings = () => { showWindow(); win.webContents.send("simply:open-settings"); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Aplikasi",
      submenu: [
        { label: "Pengaturan…", accelerator: "CmdOrCtrl+,", click: openSettings },
        { type: "separator" },
        { label: "Keluar", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Tampilan",
      submenu: [
        { role: "resetZoom", label: "Ukuran asli" },
        { role: "zoomIn", label: "Perbesar" },
        { role: "zoomOut", label: "Perkecil" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Layar penuh" },
        ...(devUrl ? [{ type: "separator" as const }, { role: "toggleDevTools" as const }] : []),
      ],
    },
  ]));

  // ---- Tray ----
  try {
    const trayIcon = join(here, "assets", "tray.png");
    if (existsSync(trayIcon)) {
      tray = new Tray(nativeImage.createFromPath(trayIcon).resize({ width: 22, height: 22 }));
      tray.setToolTip(APP_NAME);
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: "Tampilkan jendela", click: showWindow },
        { label: "Pengaturan…", click: openSettings },
        { type: "separator" },
        { label: "Jeda semua antrean", click: () => engine.agents().forEach((a) => engine.control(a.id, "pause")) },
        { label: "Lanjutkan semua antrean", click: () => engine.agents().forEach((a) => engine.control(a.id, "resume")) },
        { type: "separator" },
        { label: "Keluar", click: () => app.quit() },
      ]));
      tray.on("click", () => (win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
    }
  } catch (e) {
    console.warn("tray tidak tersedia:", e);
    tray = null;
  }

  // ---- Notifikasi desktop (hanya saat jendela tidak difokuskan) ----
  const lastStatus = new Map<string, AgentStatus>(engine.agents().map((a) => [a.id, a.status]));
  let lastSession: SessionInfo | undefined;
  const notify = (n: { title: string; body: string } | null) => {
    if (!n || !settings.notifications || !Notification.isSupported()) return;
    if (win.isFocused()) return;
    const note = new Notification({ title: n.title, body: n.body, icon: existsSync(iconPath) ? iconPath : undefined });
    note.on("click", showWindow);
    note.show();
  };
  engine.subscribe((e) => {
    if (e.type === "agent") {
      notify(agentNote(lastStatus.get(e.agent.id), e.agent));
      lastStatus.set(e.agent.id, e.agent.status);
    }
    if (e.type === "session") {
      notify(budgetNote(lastSession, e.session));
      lastSession = { ...e.session };
    }
  });

  app.on("second-instance", showWindow);

  // ---- Menutup jendela ----
  win.on("close", (e) => {
    if (quitting || !isBusy(engine.agents())) return;
    e.preventDefault();
    const buttons = tray ? ["Keluar dan hentikan agent", "Sembunyikan ke tray", "Batal"] : ["Keluar dan hentikan agent", "Batal"];
    void dialog.showMessageBox(win, {
      type: "question",
      buttons,
      defaultId: buttons.length - 1,
      cancelId: buttons.length - 1,
      message: "Masih ada agent yang berjalan atau mengantre.",
      detail: "Keluar akan membatalkan giliran yang sedang berjalan. Antrean disimpan dan bisa dilanjutkan saat app dibuka lagi.",
    }).then((r) => {
      if (r.response === 0) { quitting = true; app.quit(); }
      else if (tray && r.response === 1) win.hide();
    });
  });

  void preparePlugins();
  await win.loadURL(devUrl ?? `${ORIGIN}/`);

  // Tutup rapi: batalkan giliran agent yang berjalan, simpan state, baru keluar.
  let closing = false;
  app.on("before-quit", (e) => {
    quitting = true;
    if (closing) return;
    closing = true;
    e.preventDefault();
    void server.close().finally(() => app.quit());
  });
  app.on("window-all-closed", () => app.quit());

  return { win, server, workspace, port };
}
