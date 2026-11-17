import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface ModelChoice { value: string; name: string }

/**
 * Daftar model yang tersedia untuk akun Claude yang sedang dipakai (token/login dibaca CLI dari env).
 * Hanya meminta daftar lewat kanal kontrol SDK: tidak ada pesan terkirim, jadi tidak ada biaya inferensi.
 */
export async function listClaudeModels(timeoutMs = 30_000): Promise<ModelChoice[]> {
  const never = (async function* () { await new Promise<never>(() => {}); })(); // tanpa giliran pengguna
  const q = query({
    prompt: never,
    options: {
      cwd: tmpdir(),
      settingSources: [],
      ...(process.env.CLAUDE_CODE_EXECUTABLE ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE } : {}),
    },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    const models = await Promise.race([
      q.supportedModels(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("waktu habis mengambil daftar model")), timeoutMs); }),
    ]);
    const seen = new Set<string>();
    // "default" bukan nama model, melainkan pilihan akun; tidak ditawarkan sebagai model agent.
    return models.filter((m) => m.value !== "default" && !seen.has(m.value) && seen.add(m.value)).map((m) => ({ value: m.value, name: m.displayName || m.value }));
  } finally {
    clearTimeout(timer);
    q.close();
  }
}
