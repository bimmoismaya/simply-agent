import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface ModelChoice { value: string; name: string }
export interface AccountSummary { email?: string; organization?: string; plan?: string }
export interface ClaudeInfo { models: ModelChoice[]; account: AccountSummary }

/**
 * Model yang tersedia dan identitas akun Claude yang sedang dipakai (token/login dibaca CLI dari env).
 * Hanya meminta lewat kanal kontrol SDK: tidak ada pesan terkirim, jadi tidak ada biaya inferensi.
 * SDK memberi email, organisasi, dan paket; nama tampilan tidak tersedia.
 */
export async function loadClaudeInfo(timeoutMs = 30_000): Promise<ClaudeInfo> {
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
    const [models, acct] = await Promise.race([
      Promise.all([q.supportedModels(), q.accountInfo()]),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("waktu habis mengambil info akun")), timeoutMs); }),
    ]);
    const seen = new Set<string>();
    return {
      // "default" bukan nama model, melainkan pilihan akun; tidak ditawarkan sebagai model agent.
      models: models.filter((m) => m.value !== "default" && !seen.has(m.value) && seen.add(m.value)).map((m) => ({ value: m.value, name: m.displayName || m.value })),
      account: { email: acct.email, organization: acct.organization, plan: acct.subscriptionType },
    };
  } finally {
    clearTimeout(timer);
    q.close();
  }
}
