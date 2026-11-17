import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface PluginInfo {
  id: string;
  name: string;
  desc: string;
  repo: string;
  /** Commit yang dipin. Memperbarui plugin = mengganti SHA ini lewat perubahan kode, bukan lewat internet. */
  sha: string;
  /** Peringatan yang ditampilkan di layar pilihan. */
  warn?: string;
}

// Katalog tetap: hanya repo di sini yang pernah diunduh. UI hanya mengirim id, tidak pernah URL.
export const PLUGINS: PluginInfo[] = [
  { id: "humanizer", name: "humanizer", desc: "Menulis ulang teks agar tidak terdengar seperti AI.", repo: "https://github.com/blader/humanizer.git", sha: "b48c832f0f809c1b5658edbb838c2521b72f2413" },
  { id: "antislop", name: "antislop", desc: "Aturan anti AI slop untuk UI, copy, dan kode.", repo: "https://github.com/miqdadbadjuber/anti-slop.git", sha: "35b54dc660aa7d11428ee62c5788ad36bc18ac3c" },
  { id: "ponytail", name: "ponytail", desc: "Mode senior malas: solusi paling sederhana yang berfungsi.", repo: "https://github.com/dietrichgebert/ponytail.git", sha: "96608e078b2d5ea607c5c3b8b5a54d1c1fba6846" },
  { id: "superpowers", name: "superpowers", desc: "Skill TDD, debugging, dan alur kerja kolaborasi.", repo: "https://github.com/obra/superpowers.git", sha: "22f0b463e7a5e579904dd6211a520321035526f7" },
  { id: "caveman", name: "caveman", desc: "Gaya jawaban sangat ringkas.", repo: "https://github.com/juliusbrussee/caveman.git", sha: "9b243662ff98d392bc0a95b865a554583d71be75" },
  { id: "ui-ux-pro-max", name: "ui-ux-pro-max", desc: "Basis data gaya, palet, font, dan panduan UI/UX.", repo: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git", sha: "e59ff376a41f7ca47b7541ad5c116495cbade3ee" },
  {
    id: "last30days", name: "last30days", desc: "Riset topik dari Reddit, X, YouTube, HN, dll. (30 hari terakhir).",
    repo: "https://github.com/mvanhorn/last30days-skill.git", sha: "63123ef9cee582ebb5dc58249e34c3e1d44d0cb9",
    warn: "Butuh jaringan dan Bash, jadi hanya jalan di mode baca+tulis. Sandbox Bash belum tersedia di semua mesin.",
  },
  {
    id: "rea", name: "rea", desc: "Reverse engineering binary, aplikasi, dan firmware.",
    repo: "https://github.com/morluto/rea.git", sha: "a10037ef10516cf92653596512932b15f190a5c0",
    warn: "Dirancang untuk menjalankan dan menganalisis binary. Pakai hanya untuk analisis yang sah. Server MCP-nya tetap tidak dimuat; hanya skill-nya.",
  },
];

export const pluginDir = (root: string, p: PluginInfo) => join(root, `${p.id}-${p.sha.slice(0, 8)}`);
export const isInstalled = (root: string, p: PluginInfo) => existsSync(join(pluginDir(root, p), ".claude-plugin", "plugin.json"));

// Beberapa agent jalan paralel dan semuanya memanggil ensurePlugins; satu unduhan per plugin sudah cukup.
const inflight = new Map<string, Promise<void>>();

async function install(root: string, p: PluginInfo): Promise<void> {
  const dest = pluginDir(root, p);
  const tmp = `${dest}.part-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const git = (...args: string[]) => run("git", ["-C", tmp, ...args], { timeout: 120_000, windowsHide: true });
  try {
    await git("init", "-q");
    await git("fetch", "-q", "--depth", "1", p.repo, p.sha);
    await git("checkout", "-q", "FETCH_HEAD");
    rmSync(join(tmp, ".git"), { recursive: true, force: true });
    if (!existsSync(join(tmp, ".claude-plugin", "plugin.json"))) throw new Error("plugin.json tidak ada di repo");
    rmSync(dest, { recursive: true, force: true });
    renameSync(tmp, dest);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

/**
 * Pastikan plugin terpilih ada di disk. Yang sudah terpasang dilewati tanpa jaringan.
 * Id di luar katalog diabaikan. Unduhan yang gagal dilaporkan di `errors`; plugin lain tetap dipakai.
 */
export async function ensurePlugins(ids: string[], root: string, catalog: PluginInfo[] = PLUGINS): Promise<{ paths: string[]; errors: Record<string, string> }> {
  const paths: string[] = [];
  const errors: Record<string, string> = {};
  await Promise.all([...new Set(ids)].map(async (id) => {
    const p = catalog.find((c) => c.id === id);
    if (!p) return;
    if (!isInstalled(root, p)) {
      const dest = pluginDir(root, p);
      let job = inflight.get(dest);
      if (!job) {
        job = install(root, p).finally(() => inflight.delete(dest));
        inflight.set(dest, job);
      }
      try { await job; } catch (e) { errors[id] = e instanceof Error ? e.message.split("\n")[0] : String(e); return; }
    }
    paths.push(pluginDir(root, p));
  }));
  return { paths: paths.sort(), errors };
}
