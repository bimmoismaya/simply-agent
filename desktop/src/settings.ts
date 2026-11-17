import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";

export const PROVIDERS = ["claude", "codex", "gemini"] as const;

export const SettingsSchema = z.object({
  /** null = pakai folder bawaan di folder data pengguna. */
  workspace: z.string().min(1).max(4096).nullable().default(null),
  toolMode: z.enum(["read-only", "all"]).default("read-only"),
  /** Batas total token per sesi server; 0 = tanpa batas. */
  tokenBudget: z.number().int().min(0).max(1_000_000_000).default(0),
  /** Batas biaya USD per sesi server; 0 = tanpa batas. */
  budgetUsd: z.number().min(0).max(100_000).default(0),
  /** Override model per id agent. Yang tidak diisi memakai bawaan dari agents.config.ts. */
  models: z.record(z.string().min(1).max(40), z.string().min(1).max(80)).default({}),
  notifications: z.boolean().default(true),
  /** Token per provider (claude: `claude setup-token`; codex: API key OpenAI; gemini: API key Gemini). Hanya di proses utama; tidak pernah dikirim balik ke UI. */
  tokens: z.partialRecord(z.enum(PROVIDERS), z.string().max(2000)).default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Baca pengaturan. File rusak atau tidak valid dipindah ke .bak dan diganti bawaan, bukan membuat app gagal start. */
export function loadSettings(file: string): Settings {
  if (!existsSync(file)) return DEFAULT_SETTINGS;
  try {
    const parsed = SettingsSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* JSON rusak: jatuh ke bawah */ }
  try { renameSync(file, `${file}.bak`); } catch { /* abaikan */ }
  return DEFAULT_SETTINGS;
}

/** Simpan atomik supaya file tidak setengah tertulis kalau app mati. */
export function saveSettings(file: string, s: Settings) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * Workspace harus folder yang ada, absolut, dan tidak terlalu luas: agent boleh membaca semua isinya,
 * jadi "/" dan folder home utuh ditolak. Folder data aplikasi (state, pengaturan) juga ditolak.
 */
export function validateWorkspace(path: string, opts: { home?: string; protectedDir?: string } = {}): string | null {
  const home = opts.home ?? homedir();
  if (!isAbsolute(path)) return "Path harus absolut.";
  const p = resolve(path);
  if (p === "/" || p === resolve(home)) return "Folder terlalu luas. Pilih folder proyek di dalamnya.";
  if (opts.protectedDir) {
    const rel = relative(resolve(opts.protectedDir), p);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return "Folder ini dipakai app untuk menyimpan data. Pilih folder lain.";
  }
  try {
    if (!statSync(p).isDirectory()) return "Bukan folder.";
  } catch {
    return "Folder tidak ditemukan.";
  }
  return null;
}

export const defaultWorkspace = (userData: string) => join(userData, "workspace");
