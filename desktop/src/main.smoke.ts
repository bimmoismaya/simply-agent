// Entry khusus smoke test: runner palsu (tanpa model dan tanpa biaya), info provider palsu, dan port DevTools.
// Tidak ikut dipaketkan ke .deb.
import { launch } from "./app.ts";
import { fakeRunner } from "../../server/scripts/fake-runner.ts";

// Pemeriksaan API key palsu (tanpa jaringan): token yang memuat "salah" ditolak, selainnya diterima.
const validateToken = async (_provider: string, token: string) =>
  token.includes("salah") ? { state: "rejected" as const, detail: "ditolak (uji)" } : { state: "valid" as const, detail: "diterima (uji)" };
const openExternal = () => {}; // smoke tidak boleh membuka browser

// Info provider palsu: smoke tidak boleh memanggil provider.
const claudeInfo = async () => ({
  models: [
    { value: "claude-opus-5-5", name: "Opus 5.5" },
    { value: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    { value: "claude-haiku-5-5", name: "Haiku 5.5" },
  ],
  // Token "token-salah" meniru token tidak dikenali: SDK menjawab tanpa identitas akun.
  account: process.env.CLAUDE_CODE_OAUTH_TOKEN === "token-salah" ? {} : { email: "uji@contoh.test", organization: "Org Uji", plan: "max" },
});

launch({ runner: fakeRunner, limits: { usd: 1 }, claudeInfo, validateToken, openExternal, debugPort: Number(process.env.SIMPLY_DEBUG_PORT ?? 9333) }).catch((err) => {
  console.error(err);
  process.exit(1);
});
