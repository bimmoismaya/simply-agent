import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import type { Agent, AgentEdge, AgentStatus, ControlAction, ServerEvent, SessionInfo } from "../../shared/types.ts";
import { AGENTS, EDGES, type AgentConfig } from "./agents.config.ts";
import { runClaudeTurn, type TurnHooks, type TurnResult } from "./providers/claude.ts";
import { runCliTurn } from "./providers/cli.ts";

export type Runner = (
  cfg: AgentConfig,
  task: string,
  ctx: TurnHooks & { cwd: string; resume?: string },
) => Promise<TurnResult>;

export const defaultRunner: Runner = (cfg, task, ctx) =>
  cfg.provider === "claude"
    ? runClaudeTurn({ ...ctx, model: cfg.model, systemPrompt: cfg.systemPrompt, prompt: task })
    : runCliTurn({ ...ctx, provider: cfg.provider, prompt: task });

type Listener = (e: ServerEvent) => void;
interface Runtime {
  cfg: AgentConfig;
  agent: Agent;
  queue: string[];
  lastTask?: string;
  sessionId?: string;
  controller?: AbortController;
}
type Saved = Agent & { sessionId?: string; queue?: string[] };
export interface Limits { tokens?: number; usd?: number }

const DELEGATE = /^DELEGATE:\s*(.*?)\s*$/gm;
const Delegation = z.object({ to: z.string(), task: z.string().min(1) });
const MAX_LOG = 300;
const MAX_FILES = 50;
const PULSE_MS = 1500;

export class Engine {
  private rt = new Map<string, Runtime>();
  private edges: AgentEdge[] = EDGES.map(([from, to], i) => ({ id: `e${i}`, from, to }));
  private listeners = new Set<Listener>();
  private statePath: string;
  private session: SessionInfo;

  constructor(
    private cwd: string,
    private runner: Runner = defaultRunner,
    limits: Limits = { tokens: Number(process.env.TOKEN_BUDGET ?? 0), usd: Number(process.env.BUDGET_USD ?? 0) },
    opts: { stateDir?: string; models?: Record<string, string> } = {},
  ) {
    // State disimpan terpisah dari workspace kalau stateDir diberikan (app desktop), supaya agent tidak bisa menyentuhnya.
    this.statePath = join(opts.stateDir ?? join(cwd, ".engine"), "state.json");
    const saved = this.load();
    for (const base of AGENTS) {
      const cfg: AgentConfig = { ...base, model: opts.models?.[base.id] ?? base.model };
      const prev = saved.get(cfg.id);
      const agent: Agent = {
        id: cfg.id, name: cfg.name, role: cfg.role, provider: cfg.provider, model: cfg.model,
        status: "idle", task: "", log: [], files: [], queued: 0, paused: false, tokens: 0, costUsd: 0, startedAt: Date.now(),
        ...(prev ? {
          task: prev.task ?? "", log: prev.log ?? [], files: prev.files ?? [],
          tokens: prev.tokens ?? 0, costUsd: prev.costUsd ?? 0, status: prev.status ?? "idle",
          model: cfg.model,
        } : {}),
      };
      // Giliran "running"/"paused" dari proses sebelumnya sudah tidak hidup.
      if (agent.status === "running" || agent.status === "paused" || agent.status === "waiting") agent.status = "idle";
      const queue = (prev?.queue ?? []).filter((t): t is string => typeof t === "string");
      // Antrean dipulihkan dalam keadaan pause supaya restart tidak langsung memakai token tanpa sepengetahuan Anda.
      if (queue.length) {
        agent.queued = queue.length;
        agent.paused = true;
        agent.status = "paused";
        agent.log.push(`[restart] ${queue.length} tugas antre dipulihkan, tekan Resume untuk melanjutkan`);
      }
      this.rt.set(cfg.id, { cfg, agent, queue, sessionId: prev?.sessionId });
    }
    const all = [...this.rt.values()].map((r) => r.agent);
    this.session = {
      startedAt: Date.now(),
      spent: all.reduce((sum, a) => sum + a.tokens, 0),
      budget: limits.tokens ?? 0,
      costUsd: all.reduce((sum, a) => sum + a.costUsd, 0),
      budgetUsd: limits.usd ?? 0,
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): ServerEvent {
    return { type: "snapshot", agents: this.agents(), edges: this.edges, session: this.session };
  }

  agents(): Agent[] {
    return [...this.rt.values()].map((r) => r.agent);
  }

  command(text: string, targetIds?: string[]) {
    const ids = targetIds?.length ? targetIds : ["pip"];
    for (const id of ids) this.enqueue(id, text);
  }

  /**
   * pause: menahan antrean; giliran yang sedang jalan tetap selesai (keputusan produk).
   * kill: membatalkan giliran yang sedang jalan dan mengosongkan antrean.
   */
  control(agentId: string, action: ControlAction) {
    const r = this.rt.get(agentId);
    if (!r) return;
    if (action === "pause") {
      r.agent.paused = true;
      if (!r.controller) this.setStatus(r, "paused");
      else this.emitAgent(r);
    }
    if (action === "resume") {
      r.agent.paused = false;
      if (!r.controller) this.setStatus(r, "idle");
      this.drain(r);
    }
    if (action === "kill") {
      r.queue = [];
      r.agent.queued = 0;
      r.controller?.abort();
      if (!r.controller) this.setStatus(r, "idle");
    }
    if (action === "retry" && r.lastTask && !r.controller) {
      r.queue.unshift(r.lastTask);
      r.agent.queued = r.queue.length;
      r.agent.paused = false;
      this.drain(r);
    }
  }

  /**
   * Ubah batas dan model saat berjalan. Model baru dipakai mulai giliran berikutnya;
   * giliran yang sedang jalan tidak terganggu.
   */
  configure(c: { limits?: Limits; models?: Record<string, string> }) {
    if (c.limits) {
      this.session.budget = c.limits.tokens ?? 0;
      this.session.budgetUsd = c.limits.usd ?? 0;
      this.emit({ type: "session", session: this.session });
    }
    if (c.models) {
      for (const r of this.rt.values()) {
        const model = c.models[r.cfg.id];
        if (!model || model === r.cfg.model) continue;
        r.cfg = { ...r.cfg, model };
        r.agent.model = model;
        this.emitAgent(r);
      }
      this.save();
    }
    // Batas baru bisa membuka kembali agent yang tertahan karena budget.
    for (const r of this.rt.values()) if (r.agent.status === "waiting") this.drain(r);
  }

  /** Batalkan semua giliran yang berjalan dan simpan state (antrean ikut tersimpan). Dipanggil saat server ditutup. */
  shutdown() {
    for (const r of this.rt.values()) r.controller?.abort();
    this.save();
  }

  isPaused(agentId: string) {
    return this.rt.get(agentId)?.agent.paused ?? false;
  }

  /** Untuk tes dan shutdown: tunggu sampai tidak ada giliran berjalan. */
  async idle(timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    while ([...this.rt.values()].some((r) => r.controller) && Date.now() < end)
      await new Promise((res) => setTimeout(res, 10));
  }

  private enqueue(id: string, task: string) {
    const r = this.rt.get(id);
    if (!r) return;
    r.queue.push(task);
    r.agent.queued = r.queue.length;
    this.emitAgent(r);
    this.save();
    this.drain(r);
  }

  private overBudget() {
    const s = this.session;
    if (s.budget && s.spent >= s.budget) return `batas ${s.budget} token`;
    if (s.budgetUsd && s.costUsd >= s.budgetUsd) return `batas USD ${s.budgetUsd}`;
    return null;
  }

  private drain(r: Runtime) {
    if (r.controller || r.queue.length === 0) return;
    if (r.agent.paused) { this.setStatus(r, "paused"); return; }
    const over = this.overBudget();
    if (over) {
      this.log(r, `[budget] ${over} tercapai, tugas ditahan`);
      this.setStatus(r, "waiting");
      return;
    }
    const task = r.queue.shift()!;
    r.agent.queued = r.queue.length;
    r.lastTask = task;
    void this.run(r, task);
  }

  private async run(r: Runtime, task: string) {
    const controller = new AbortController();
    r.controller = controller;
    r.agent.task = task;
    this.setStatus(r, "running");
    this.log(r, `> ${task}`);

    // Teks streaming dipotong per baris supaya log tampil saat itu juga.
    let buf = "";
    const flush = (all: boolean) => {
      const parts = buf.split("\n");
      buf = all ? "" : parts.pop() ?? "";
      for (const line of parts) if (line.trim()) this.log(r, line);
    };

    try {
      const res = await this.runner(r.cfg, task, {
        cwd: this.cwd,
        resume: r.sessionId,
        signal: controller.signal,
        onText: (chunk) => { buf += chunk; flush(false); },
        delegate: r.cfg.role === "coordinator" ? (to, t) => this.delegateTo(r, to, t) : undefined,
        onTool: (tool, path) => {
          this.log(r, `· ${tool}${path ? ` ${this.rel(path)}` : ""}`);
          // Path di luar workspace pasti ditolak policy; jangan dicatat sebagai file yang disentuh.
          if (path && !this.rel(path).startsWith("..")) this.addFile(r, this.rel(path));
        },
      });
      flush(true);
      r.sessionId = res.sessionId ?? r.sessionId;
      r.agent.tokens += res.tokens;
      r.agent.costUsd += res.costUsd ?? 0;
      this.session.spent += res.tokens;
      this.session.costUsd += res.costUsd ?? 0;
      this.emit({ type: "session", session: this.session });
      this.setStatus(r, "done");
      this.routeDelegations(r, res.text);
    } catch (e) {
      flush(true);
      const aborted = controller.signal.aborted;
      this.log(r, aborted ? "[kill] giliran dibatalkan" : `[error] ${(e as Error).message}`);
      this.setStatus(r, aborted ? "idle" : "error");
    } finally {
      r.controller = undefined;
      if (r.agent.paused && r.agent.status !== "error") this.setStatus(r, "paused");
      this.save();
      this.drain(r);
    }
  }

  /** Dipakai tool `delegate` (jalur utama) dan baris teks DELEGATE (cadangan untuk provider CLI). */
  private delegateTo(from: Runtime, to: string, task: string): string {
    const target = [...this.rt.values()].find((x) => x.cfg.name.toLowerCase() === to.trim().toLowerCase());
    if (!target || target === from) {
      this.log(from, `[delegate] agent ${to} tidak ada`);
      const valid = [...this.rt.values()].filter((x) => x !== from).map((x) => x.cfg.name).join(", ");
      return `Error: agent "${to}" does not exist. Valid: ${valid}`;
    }
    this.log(from, `[delegate] ${target.cfg.name}: ${task}`);
    this.pulse(from.cfg.id, target.cfg.id, task);
    this.enqueue(target.cfg.id, task);
    return `Queued for ${target.cfg.name}. Its result appears in its own log; you do not receive it in this turn.`;
  }

  // Cadangan: "DELEGATE: {...}" di teks balasan. Baris yang tidak valid dicatat lalu dilewati.
  private routeDelegations(from: Runtime, text: string) {
    for (const [, json] of text.matchAll(DELEGATE)) {
      let parsed: z.infer<typeof Delegation>;
      try { parsed = Delegation.parse(JSON.parse(json)); }
      catch { this.log(from, "[delegate] format tidak valid, dilewati"); continue; }
      this.delegateTo(from, parsed.to, parsed.task);
    }
  }

  private pulse(from: string, to: string, task: string) {
    const edge = this.edges.find((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    if (!edge) return;
    edge.active = true;
    edge.label = task.length > 40 ? `${task.slice(0, 39)}…` : task;
    this.emit({ type: "edge", edge: { ...edge } });
    setTimeout(() => { edge.active = false; this.emit({ type: "edge", edge: { ...edge } }); }, PULSE_MS).unref();
  }

  private rel(p: string) {
    const r = relative(this.cwd, resolve(this.cwd, p));
    return r || ".";
  }

  private addFile(r: Runtime, p: string) {
    if (r.agent.files.includes(p)) return;
    r.agent.files.push(p);
    if (r.agent.files.length > MAX_FILES) r.agent.files.shift();
  }

  private setStatus(r: Runtime, status: AgentStatus) {
    r.agent.status = status;
    this.emitAgent(r);
  }

  private log(r: Runtime, line: string) {
    r.agent.log.push(line);
    if (r.agent.log.length > MAX_LOG) r.agent.log.splice(0, r.agent.log.length - MAX_LOG);
    this.emitAgent(r);
  }

  private emitAgent(r: Runtime) {
    this.emit({ type: "agent", agent: r.agent });
  }

  private emit(e: ServerEvent) {
    for (const fn of this.listeners) fn(e);
  }

  // Simpan atomik supaya state tidak rusak kalau proses mati di tengah tulisan.
  private save() {
    const data: Record<string, Saved> = Object.fromEntries(
      [...this.rt.values()].map((r) => [r.cfg.id, { ...r.agent, sessionId: r.sessionId, queue: r.queue }]));
    mkdirSync(dirname(this.statePath), { recursive: true });
    const tmp = `${this.statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.statePath);
  }

  private load(): Map<string, Partial<Saved>> {
    const out = new Map<string, Partial<Saved>>();
    try {
      const raw = JSON.parse(readFileSync(this.statePath, "utf8")) as Record<string, Partial<Saved>>;
      for (const [id, a] of Object.entries(raw)) out.set(id, a);
    } catch { /* belum ada state atau rusak: mulai baru */ }
    return out;
  }
}
