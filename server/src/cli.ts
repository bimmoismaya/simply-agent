import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { startServer } from "./index.ts";

const port = Number(process.env.PORT ?? 8787);
// Agent bekerja di workspace/, bukan di root repo, supaya tidak menyentuh kode proyek.
const workspace = resolve(process.env.WORKSPACE ?? "../workspace");
const token = process.env.SIMPLY_TOKEN || randomBytes(16).toString("hex");
const origins = process.env.UI_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

const server = startServer({ port, workspace, token, origins });
server.ready.then((p) => {
  console.log(`engine ws://127.0.0.1:${p}  workspace=${workspace}  tools=${process.env.AGENT_TOOLS === "all" ? "all" : "read-only"}`);
  console.log(`buka UI: http://localhost:5173/?token=${token}`);
  if (process.env.AGENT_TOOLS === "all" && process.env.AGENT_SANDBOX === "off")
    console.warn("PERINGATAN: AGENT_SANDBOX=off. Bash agent jalan tanpa sandbox OS; hanya allowlist yang membatasi.");
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close().then(() => process.exit(0)));
