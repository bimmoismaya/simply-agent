// Ikon garis geometris: satu bentuk per peran. Warna mengikuti status (redup saat idle).
const SHAPES: Record<string, React.ReactNode> = {
  coordinator: <><polygon points="8,1.5 14,4.75 14,11.25 8,14.5 2,11.25 2,4.75" /><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" /></>,
  reviewer: <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" />,
  frontend: <rect x="2.5" y="2.5" width="11" height="11" />,
  tester: <polygon points="8,2 14.5,13.5 1.5,13.5" />,
};

export function AgentIcon({ role, className = "", dim = false }: { role: string; className?: string; dim?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="none" stroke={dim ? "#5b6770" : "#22d3ee"} strokeWidth="1.5" strokeLinejoin="round">
      {SHAPES[role] ?? <circle cx="8" cy="8" r="6" />}
    </svg>
  );
}
