import type { Agent } from "../../../shared/types.ts";
import { AgentIcon } from "./AgentIcon";
import { STATUS_DOT, STATUS_TEXT } from "./status";
import { ROLE_ORDER } from "../layout";

export function Sidebar({ agents, selectedId, onSelect }: {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const roles = [...new Set(agents.map((a) => a.role))].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  return (
    <nav aria-label="Daftar agent" className="w-[240px] shrink-0 overflow-y-auto border-r border-signal/20 bg-panel px-2 py-3 text-xs">
      {roles.map((role) => {
        const group = agents.filter((a) => a.role === role);
        const live = group.filter((a) => a.status === "running").length;
        return (
          <section key={role} className="mb-4">
            <h2 className="mb-1 flex justify-between px-2 font-display text-[12px] uppercase tracking-[0.25em] text-signal">
              <span>{role}</span>
              <span className="text-dim">{live}/{group.length}</span>
            </h2>
            {group.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                aria-current={selectedId === a.id ? "true" : undefined}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left outline-none hover:bg-signal/10 focus-visible:ring-1 focus-visible:ring-signal ${
                  selectedId === a.id ? "bg-signal/15" : ""
                }`}
              >
                <AgentIcon role={a.role} className="h-3.5 w-3.5 shrink-0" dim={a.status === "idle"} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-zinc-100">{a.name}</span>
                  <span className="truncate text-[10px] text-dim">{a.model}</span>
                </span>
                <span className={`ml-auto flex items-center gap-1.5 text-[10px] ${STATUS_TEXT[a.status]}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
                  {a.status}
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </nav>
  );
}
