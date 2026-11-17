import { spawn } from "node:child_process";
import type { TurnHooks, TurnResult } from "./claude.ts";

// Adapter untuk Codex dan Gemini lewat CLI-nya. Token tidak dihitung (CLI tidak melaporkannya).
const COMMANDS: Record<"codex" | "gemini", (prompt: string) => [string, string[]]> = {
  codex: (prompt) => ["codex", ["exec", prompt]],
  gemini: (prompt) => ["gemini", ["-p", prompt]],
};

export function runCliTurn(opts: TurnHooks & {
  provider: "codex" | "gemini";
  cwd: string;
  prompt: string;
}): Promise<TurnResult> {
  const [bin, args] = COMMANDS[opts.provider](opts.prompt);
  return new Promise((resolve, reject) => {
    // Tanpa shell: prompt diteruskan sebagai satu argumen, tidak diinterpretasi.
    const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    let stderr = "";
    const onAbort = () => child.kill("SIGTERM");
    opts.signal.addEventListener("abort", onAbort, { once: true });
    // Streaming: setiap potongan stdout langsung diteruskan.
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      text += s;
      opts.onText(s);
    });
    child.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.on("error", (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === "ENOENT" ? `${bin} tidak terpasang` : e.message)));
    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (opts.signal.aborted) return reject(new Error("dibatalkan"));
      if (code === 0) return resolve({ text, tokens: 0 });
      const last = stderr.trim().split("\n").pop();
      reject(new Error(`${bin} exit ${code}${last ? `: ${last}` : ""}`));
    });
  });
}
