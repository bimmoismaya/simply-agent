import { useState } from "react";
import type { Agent } from "../../../shared/types.ts";

// Chip mengisi target lewat @mention; Stop all langsung membatalkan semua agent.
const CHIPS: { label: string; prefix: string }[] = [
  { label: "Plan", prefix: "@Pip buat rencana: " },
  { label: "Review", prefix: "@Dax @Maya review: " },
  { label: "Test", prefix: "@Ken @Lia uji: " },
];

export function CommandBar({ agents, onSend, onStopAll }: {
  agents: Agent[];
  onSend: (text: string, targets: string[]) => void;
  onStopAll: () => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const mention = text.match(/@(\w*)$/);
  const matches = mention ? agents.filter((a) => a.name.toLowerCase().startsWith(mention[1].toLowerCase())) : [];
  const showList = open && matches.length > 0;

  const complete = (name: string) => setText(text.replace(/@\w*$/, `@${name} `));

  const submit = () => {
    const targets = [...text.matchAll(/@(\w+)/g)]
      .map((m) => agents.find((a) => a.name.toLowerCase() === m[1].toLowerCase())?.id)
      .filter((x): x is string => Boolean(x));
    const body = text.replace(/@\w+/g, "").trim();
    if (body) onSend(body, targets);
    setText("");
  };

  const busy = agents.some((a) => a.status === "running" || a.queued > 0);

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex w-[min(680px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        {CHIPS.map((c) => (
          <button key={c.label} onClick={() => { setText(c.prefix); document.getElementById("command")?.focus(); }}
            className="rounded-full border border-signal/40 bg-ink/90 px-3 py-0.5 text-[11px] text-zinc-200 outline-none hover:bg-signal/15 focus-visible:ring-1 focus-visible:ring-signal">
            {c.label}
          </button>
        ))}
        <button onClick={onStopAll} disabled={!busy} title="Kill semua agent yang berjalan atau punya antrean"
          className="rounded-full border border-signal/70 bg-ink/90 px-3 py-0.5 text-[11px] text-cyan-200 outline-none hover:bg-signal/25 focus-visible:ring-1 focus-visible:ring-signal disabled:opacity-35">
          Stop all
        </button>
      </div>
      {showList && (
        <ul role="listbox" aria-label="Pilih agent" className="pointer-events-auto border border-signal/30 bg-panel text-xs">
          {matches.map((a, i) => (
            <li key={a.id} role="option" aria-selected={i === 0}>
              <button className={`w-full px-3 py-1 text-left hover:bg-signal/10 ${i === 0 ? "bg-signal/10" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); complete(a.name); }}>
                @{a.name} <span className="text-dim">{a.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="pointer-events-auto flex items-center gap-3 border border-signal/45 bg-panel/95 px-3 py-2 shadow-[0_0_24px_rgba(34,211,238,0.15)]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-signal" aria-hidden="true" />
        <label htmlFor="command" className="sr-only">Perintah untuk agent</label>
        <input
          id="command"
          autoComplete="off"
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && showList) { e.preventDefault(); complete(matches[0].name); }
            if (e.key === "Escape") { setText(""); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder={`Command ${agents.length} agents · @ to direct · / untuk fokus`}
          className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button type="submit" disabled={!text.trim()}
          className="text-[11px] uppercase tracking-widest text-signal outline-none hover:text-cyan-200 focus-visible:ring-1 focus-visible:ring-signal disabled:opacity-35">
          kirim ↵
        </button>
      </form>
    </div>
  );
}
