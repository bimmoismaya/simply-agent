export interface AuthStatus {
  /** false = token belum diisi, agent diblokir. */
  loggedIn: boolean | null;
  method?: string;
  detail: string;
}

/** Variabel env yang dibaca CLI tiap provider. */
export const TOKEN_ENV = { claude: "CLAUDE_CODE_OAUTH_TOKEN", codex: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" } as const;

/** Token wajib diisi manual. Isinya tidak divalidasi ke server Claude; token salah baru ketahuan saat agent jalan. */
export function tokenStatus(token: string): AuthStatus {
  return token
    ? { loggedIn: true, method: "token", detail: "Token terisi." }
    : { loggedIn: false, detail: "Token belum diisi." };
}
