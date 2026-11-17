import type { TokenCheck } from "../../shared/tokens.ts";

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number }>;

const TIMEOUT_MS = 10_000;

/**
 * Periksa API key ke penyedianya dengan satu permintaan daftar model (tanpa biaya).
 * 200 = valid; 401/403 (dan 400 untuk Google) = ditolak; selain itu atau gagal jaringan = tidak bisa dipastikan.
 * Key hanya dikirim ke penyedianya sendiri, lewat header, tidak pernah dicatat.
 * Claude diperiksa di tempat lain (lewat info akun SDK).
 */
export async function validateProviderToken(provider: string, token: string, fetchImpl: FetchLike = fetch): Promise<TokenCheck> {
  const target: { url: string; headers: Record<string, string>; reject: number[] } | null =
    provider === "codex" ? { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${token}` }, reject: [401, 403] }
    : provider === "gemini" ? { url: "https://generativelanguage.googleapis.com/v1beta/models", headers: { "x-goog-api-key": token }, reject: [400, 401, 403] }
    : null;
  if (!target) return { state: "unknown", detail: "Provider ini belum bisa diperiksa otomatis." };
  try {
    const res = await fetchImpl(target.url, { headers: target.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 200) return { state: "valid", detail: "key diterima penyedia" };
    if (target.reject.includes(res.status)) return { state: "rejected", detail: `key ditolak penyedia (HTTP ${res.status})` };
    return { state: "unknown", detail: `penyedia menjawab HTTP ${res.status}` };
  } catch {
    return { state: "unknown", detail: "tidak bisa menghubungi penyedia (jaringan?)" };
  }
}
