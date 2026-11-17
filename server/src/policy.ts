import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type Decision = { allow: true } | { allow: false; reason: string };

const READ_TOOLS = new Set(["Read", "Glob", "Grep", "LS"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const NETWORK_TOOLS = new Set(["WebFetch", "WebSearch"]);
// ToolSearch hanya memuat skema tool yang ditunda; pemanggilan tool itu sendiri tetap dicek di sini.
const ALWAYS_OK = new Set(["TodoWrite", "ToolSearch"]);
const PATH_KEYS = ["file_path", "path", "notebook_path"];
const DEFAULT_BASH = ["ls", "cat", "head", "tail", "wc", "pwd", "node", "npm", "npx", "git"];
// Karakter yang memungkinkan merangkai atau mengalihkan perintah.
const SHELL_META = /[;&|`$<>(){}\n\\]/;

const deny = (reason: string): Decision => ({ allow: false, reason });

// Ikuti symlink kalau path sudah ada; kalau belum (file baru), cek folder induknya.
function real(p: string): string {
  try { return realpathSync(p); }
  catch {
    try { return resolve(realpathSync(dirname(p)), p.slice(dirname(p).length + 1)); }
    catch { return p; }
  }
}

export function insideWorkspace(p: string, cwd: string): boolean {
  const root = real(cwd);
  const target = real(resolve(cwd, p));
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Aturan izin tool untuk semua agent. Default hanya baca di dalam workspace.
 * allowAll (AGENT_TOOLS=all) membuka tulis, Bash dengan allowlist, dan jaringan.
 */
export function checkTool(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
  allowAll: boolean,
  bashAllow: string[] = DEFAULT_BASH,
  extraAllowed: string[] = [],
): Decision {
  // extraAllowed: tool milik engine sendiri, mis. mcp__simply__delegate untuk koordinator.
  if (ALWAYS_OK.has(tool) || extraAllowed.includes(tool)) return { allow: true };

  const paths = PATH_KEYS.map((k) => input[k]).filter((v): v is string => typeof v === "string");
  for (const p of paths) {
    if (!insideWorkspace(p, cwd)) return deny(`${tool}: ${p} di luar workspace`);
  }

  if (READ_TOOLS.has(tool)) {
    const pattern = input.pattern;
    if (tool === "Glob" && typeof pattern === "string" && (pattern.includes("..") || isAbsolute(pattern)))
      return deny("Glob: pola tidak boleh keluar dari workspace");
    return { allow: true };
  }

  if (WRITE_TOOLS.has(tool)) {
    if (!allowAll) return deny(`${tool} dinonaktifkan. Set AGENT_TOOLS=all.`);
    if (paths.length === 0) return deny(`${tool}: path tidak ada`);
    return { allow: true };
  }

  if (tool === "Bash") {
    if (!allowAll) return deny("Bash dinonaktifkan. Set AGENT_TOOLS=all.");
    const cmd = String(input.command ?? "").trim();
    if (SHELL_META.test(cmd)) return deny("Bash: perangkai atau pengalih perintah tidak diizinkan");
    const words = cmd.split(/\s+/);
    if (!bashAllow.includes(words[0])) return deny(`Bash: ${words[0]} tidak ada di allowlist`);
    for (const w of words.slice(1)) {
      if (w.includes("..") || (isAbsolute(w) && !insideWorkspace(w, cwd)))
        return deny(`Bash: argumen ${w} keluar dari workspace`);
    }
    // shortcut: npm/npx/node tetap bisa menjalankan kode apa pun dari workspace, perlu container kalau workspace tidak dipercaya.
    return { allow: true };
  }

  if (NETWORK_TOOLS.has(tool)) return allowAll ? { allow: true } : deny(`${tool} dinonaktifkan. Set AGENT_TOOLS=all.`);

  return deny(`${tool} tidak ada di daftar tool yang diizinkan`);
}
