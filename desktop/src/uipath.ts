import { isAbsolute, relative, resolve } from "node:path";

/**
 * Ubah path URL (mis. "/assets/a.js") menjadi file di dalam uiDir.
 * Mengembalikan null kalau hasilnya keluar dari uiDir, mengandung byte NUL, atau tidak bisa didekode.
 */
export function resolveUiFile(uiDir: string, pathname: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const rel = decoded.replace(/^\/+/, "") || "index.html";
  const file = resolve(uiDir, rel);
  const inside = relative(uiDir, file);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return null;
  return file;
}
