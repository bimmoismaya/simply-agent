// Runner palsu (tanpa model, tanpa biaya) untuk smoke test. Pip mendelegasikan ke Dax dan Ken.
import type { Runner } from "../src/engine.ts";

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("abort")); }, { once: true });
});

export const fakeRunner: Runner = async (cfg, task, ctx) => {
  await wait(150, ctx.signal);
  if (cfg.role === "coordinator" && ctx.delegate) {
    ctx.onText("Membagi tugas.\n");
    ctx.delegate("Dax", `review: ${task}`);
    ctx.delegate("Ken", `uji: ${task}`);
    return { text: "Membagi tugas.\n", tokens: 120, costUsd: 0.004 };
  }
  ctx.onTool("Read", "src/app.ts");
  for (const line of [`mulai: ${task}`, "memeriksa src/app.ts", "selesai, tidak ada temuan"]) {
    await wait(120, ctx.signal);
    ctx.onText(`${line}\n`);
  }
  return { text: "selesai\n", tokens: 80, costUsd: 0.002 };
};
