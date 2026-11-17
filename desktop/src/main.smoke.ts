// Entry khusus smoke test: runner palsu (tanpa model dan tanpa biaya), info provider palsu, dan port DevTools.
// Tidak ikut dipaketkan ke .deb.
import { launch } from "./app.ts";
import { fakeRunner } from "../../server/scripts/fake-runner.ts";

// Info provider palsu: smoke tidak boleh memanggil provider.
const claudeInfo = async () => ({
  models: [
    { value: "claude-opus-5-5", name: "Opus 5.5" },
    { value: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    { value: "claude-haiku-5-5", name: "Haiku 5.5" },
  ],
  account: { email: "uji@contoh.test", organization: "Org Uji", plan: "max" },
});

launch({ runner: fakeRunner, limits: { usd: 1 }, claudeInfo, debugPort: Number(process.env.SIMPLY_DEBUG_PORT ?? 9333) }).catch((err) => {
  console.error(err);
  process.exit(1);
});
