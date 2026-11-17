import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { createSdkMcpServer, query, tool, type HookCallback, type Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { checkTool } from "../policy.ts";

export interface TurnResult {
  text: string;
  sessionId?: string;
  tokens: number;
  costUsd?: number;
}

export interface TurnHooks {
  signal: AbortSignal;
  onText: (chunk: string) => void;
  onTool: (tool: string, path?: string) => void;
  /** Hanya untuk koordinator: serahkan tugas ke agent lain. Mengembalikan pesan untuk model. */
  delegate?: (to: string, task: string) => string;
}

export const DELEGATE_TOOL = "mcp__simply__delegate";

// File rahasia yang tidak boleh dibaca perintah Bash, walau di dalam sandbox.
const SECRET_PATHS = [".ssh", ".aws", ".gnupg", ".config/gh", ".claude/.credentials.json", ".netrc", ".npmrc"]
  .map((p) => join(homedir(), p));

function delegateServer(delegate: NonNullable<TurnHooks["delegate"]>) {
  return createSdkMcpServer({
    name: "simply",
    tools: [
      tool(
        "delegate",
        "Hand a task to another agent by name. Call once per task; calls run in parallel.",
        { to: z.string().describe("Agent name, e.g. Dax"), task: z.string().min(1).describe("What the agent should do") },
        async ({ to, task }) => ({ content: [{ type: "text", text: delegate(to, task) }] }),
        // Tanpa ini tool dimuat tertunda dan model harus memanggil ToolSearch dulu (yang ditolak policy).
        { alwaysLoad: true },
      ),
    ],
  });
}

export async function runClaudeTurn(opts: TurnHooks & {
  cwd: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  resume?: string;
}): Promise<TurnResult> {
  const allowAll = process.env.AGENT_TOOLS === "all";
  const bashAllow = process.env.BASH_ALLOW?.split(",").map((s) => s.trim()).filter(Boolean);
  const extra = opts.delegate ? [DELEGATE_TOOL] : [];
  const decide = (name: string, input: unknown) =>
    checkTool(name, (input ?? {}) as Record<string, unknown>, opts.cwd, allowAll, bashAllow, extra);

  // Hook dipanggil untuk setiap tool, termasuk tool baca yang tidak lewat canUseTool.
  const preToolUse: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const d = decide(input.tool_name, input.tool_input);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: d.allow ? "allow" : "deny",
        permissionDecisionReason: d.allow ? undefined : d.reason,
      },
    };
  };

  // Plugin terpilih (path lokal, dipasang oleh app). MCP milik plugin tidak dimuat: policy menolaknya dan rea tidak boleh jalan.
  const pluginPaths = (process.env.AGENT_PLUGINS ?? "").split(delimiter).filter(Boolean);

  const abortController = new AbortController();
  const options: Options = {
    cwd: opts.cwd,
    // Agent tidak memuat CLAUDE.md dan setting dari repo induk, supaya instruksi proyek tidak bocor ke agent.
    settingSources: [],
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    resume: opts.resume,
    // Hanya tool yang boleh dipakai yang dimuat: skema tool lain tidak ikut dibaca ulang tiap putaran.
    ...(allowAll ? {} : { tools: ["Read", "Glob", "Grep", ...(pluginPaths.length ? ["Skill"] : [])] }),
    ...(pluginPaths.length ? { plugins: pluginPaths.map((path) => ({ type: "local" as const, path, skipMcpDiscovery: true })) } : {}),
    // Batas putaran: mencegah loop mencoba ulang tool yang ditolak. Tiap putaran membaca ulang seluruh konteks.
    maxTurns: 8,
    abortController,
    // App desktop: binary `claude` ada di luar asar, jadi alamatnya diberikan lewat env oleh proses utama.
    ...(process.env.CLAUDE_CODE_EXECUTABLE ? { pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE } : {}),
    permissionMode: "default",
    // Hook gagal = tool diblokir, bukan diloloskan.
    hooks: { PreToolUse: [{ hooks: [preToolUse], onFailure: "block" }] },
    canUseTool: async (name, input) => {
      const d = decide(name, input);
      return d.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: d.reason };
    },
    ...(opts.delegate ? { mcpServers: { simply: delegateServer(opts.delegate) } } : {}),
    // Saat Bash dibuka, setiap perintah jalan di sandbox OS (bubblewrap): tulis hanya ke workspace,
    // jaringan hanya ke domain yang diizinkan, dan file rahasia di home tidak bisa dibaca.
    // Kalau sandbox tidak tersedia, Bash gagal (fail-closed). AGENT_SANDBOX=off mematikannya secara sadar.
    ...(allowAll && process.env.AGENT_SANDBOX !== "off" ? {
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        autoAllowBashIfSandboxed: false,
        filesystem: { allowWrite: [opts.cwd], denyRead: SECRET_PATHS },
        network: {
          allowedDomains: (process.env.SANDBOX_DOMAINS ?? "registry.npmjs.org").split(",").map((s) => s.trim()).filter(Boolean),
        },
      },
    } : {}),
  };
  if (opts.signal.aborted) abortController.abort();
  opts.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  let text = "";
  let sessionId: string | undefined;
  let tokens = 0;
  let costUsd = 0;

  for await (const msg of query({ prompt: opts.prompt, options })) {
    if (msg.type === "system" && "session_id" in msg) sessionId = msg.session_id;
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          text += `${block.text}\n`;
          // Satu blok teks = satu atau lebih baris utuh; "\n" mencegah blok berikutnya menempel.
          opts.onText(`${block.text}\n`);
        }
        if (block.type === "tool_use") {
          const input = (block.input ?? {}) as Record<string, unknown>;
          const p = input.file_path ?? input.path ?? input.notebook_path;
          opts.onTool(block.name, typeof p === "string" ? p : undefined);
        }
      }
    }
    if (msg.type === "result") {
      tokens = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
      costUsd = msg.total_cost_usd ?? 0;
      sessionId = msg.session_id ?? sessionId;
      if (msg.is_error) throw new Error(msg.subtype);
    }
  }
  return { text, sessionId, tokens, costUsd };
}
