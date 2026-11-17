// Server dengan runner palsu (tanpa model, tanpa biaya) untuk smoke test UI.
// Pip mendelegasikan ke Dax dan Ken; agent lain membalas beberapa baris dan "membaca" satu file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/index.ts";
import { fakeRunner as runner } from "./fake-runner.ts";

const port = Number(process.env.PORT ?? 8799);
const token = process.env.SIMPLY_TOKEN ?? "smoke";
const origins = process.env.UI_ORIGINS?.split(",") ?? ["http://localhost:5199"];
startServer({ port, token, origins, runner, workspace: mkdtempSync(join(tmpdir(), "smoke-")), limits: { usd: 1 } })
  .ready.then((p) => console.log(`fake server ws://127.0.0.1:${p}`));
