// Entry khusus smoke test: runner palsu (tanpa model dan tanpa biaya), pengecekan login palsu, dan port DevTools.
// Tidak ikut dipaketkan ke .deb.
import { launch } from "./app.ts";
import { fakeRunner } from "../../server/scripts/fake-runner.ts";
import type { AuthStatus } from "./auth.ts";

// SIMPLY_FAKE_AUTH=out: dua pengecekan pertama (mulai app dan tutup pengaturan awal) "belum login", sesudahnya "login" (menguji tombol Cek ulang).
let calls = 0;
const authCheck = async (): Promise<AuthStatus> =>
  process.env.SIMPLY_FAKE_AUTH === "out" && calls++ < 2
    ? { loggedIn: false, detail: "Belum login ke Claude." }
    : { loggedIn: true, method: "claude.ai", detail: "Login lewat claude.ai." };

launch({ runner: fakeRunner, limits: { usd: 1 }, authCheck, debugPort: Number(process.env.SIMPLY_DEBUG_PORT ?? 9333) }).catch((err) => {
  console.error(err);
  process.exit(1);
});
