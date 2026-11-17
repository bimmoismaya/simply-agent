// Bundle proses utama (ESM) dan preload (CJS), lalu salin UI hasil build ke dist/ui.
import { cpSync, existsSync, rmSync } from "node:fs";
import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node24", sourcemap: false, logLevel: "info" };

if (!existsSync("../ui/dist/index.html")) throw new Error("ui/dist belum ada. Jalankan build UI dulu.");
rmSync("dist", { recursive: true, force: true });

await build({
  ...common,
  entryPoints: ["src/main.ts", "src/main.smoke.ts"],
  outdir: "dist",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  // SDK tetap di node_modules: ia membawa binary native `claude` yang tidak boleh dibundel.
  external: ["electron", "@anthropic-ai/claude-agent-sdk"],
  // ws dan zod memakai require() bawaan Node; di bundle ESM butuh shim ini.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
await build({
  ...common,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  format: "cjs",
  external: ["electron"],
});
cpSync("../ui/dist", "dist/ui", { recursive: true });
cpSync("assets", "dist/assets", { recursive: true });
