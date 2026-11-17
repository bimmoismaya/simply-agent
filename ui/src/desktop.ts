// Tipe jembatan preload app desktop (window.simply). Di browser biasa objek ini tidak ada.
export type ToolMode = "read-only" | "all";

export interface DesktopSettings {
  workspace: string | null;
  toolMode: ToolMode;
  tokenBudget: number;
  budgetUsd: number;
  models: Record<string, string>;
  notifications: boolean;
  nickname: string;
  /** Selalu kosong dari app; token tidak dikirim ke UI. */
  tokens: Record<string, string>;
  plugins: string[];
  setupDone: boolean;
}

export interface SettingsInfo {
  settings: DesktopSettings;
  effectiveWorkspace: string;
  workspaceLocked: boolean;
  defaultWorkspace: string;
  tokenSet: Record<string, boolean>;
  platform: string;
  plugins: { id: string; name: string; desc: string; warn: string | null; installed: boolean }[];
}

export type SaveResult = { ok: true; restart: boolean; pluginErrors: Record<string, string> } | { ok: false; error: string };
export type ChooseResult = { canceled: true } | { error: string } | { path: string };
export interface AccountSummary { email?: string; organization?: string; plan?: string }

export interface SimplyBridge {
  connection(): Promise<{ url: string; token: string }>;
  getSettings(): Promise<SettingsInfo>;
  saveSettings(s: DesktopSettings): Promise<SaveResult>;
  chooseWorkspace(): Promise<ChooseResult>;
  setToken(provider: string, token: string): Promise<{ ok: true } | { ok: false; error: string }>;
  claudeInfo(): Promise<{ ok: true; models: { value: string; name: string }[]; account: AccountSummary } | { ok: false; error: string }>;
  onOpenSettings(cb: () => void): () => void;
}

declare global {
  interface Window { simply?: SimplyBridge }
}

export const KNOWN_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
