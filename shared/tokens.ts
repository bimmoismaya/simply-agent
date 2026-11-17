// Aturan token yang dipakai UI (petunjuk langsung saat menempel) dan proses utama (penegakan). Tanpa dependensi.

/** Halaman pembuatan key per provider. Alamat tetap: UI hanya mengirim nama provider, tidak pernah URL. Claude tidak punya halaman; tokennya dari `claude setup-token`. */
export const TOKEN_PAGES: Record<string, string> = {
  codex: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
};

export type CheckState = "valid" | "rejected" | "unknown";
export interface TokenCheck { state: CheckState; detail: string }

/** Rapikan hasil menempel: spasi di ujung dan awalan "Bearer " dibuang. */
export function cleanToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, "").trim();
}

/** Kesalahan tempel yang jelas terlihat dari bentuknya. null = tidak ada masalah (atau kosong, artinya hapus). */
export function shapeProblem(provider: string, raw: string): string | null {
  const t = cleanToken(raw);
  if (!t) return null;
  if (/\s/.test(t)) return "Token tidak boleh mengandung spasi atau baris baru. Salin hanya token-nya.";
  if (/^https?:\/\//i.test(t) || t.includes("code=")) return "Itu alamat (URL), bukan token. Tempel token-nya saja.";
  if (provider === "claude") {
    if (t.includes("#")) return "Itu kode dari halaman browser, bukan token. Tempel kode itu ke terminal tempat `claude setup-token` menunggu, lalu salin token yang dicetak terminal.";
    if (/^sk-ant-api/i.test(t)) return "Itu API key Anthropic. Kolom ini hanya menerima token dari `claude setup-token`.";
  }
  return null;
}
