import { useEffect, useRef, useState } from "react";
import type { Agent } from "../../../shared/types.ts";
import { KNOWN_MODELS, type DesktopSettings, type SettingsInfo, type ToolMode } from "../desktop";

const field = "w-full border border-signal/30 bg-ink px-2 py-1 text-xs text-zinc-100 outline-none focus-visible:ring-1 focus-visible:ring-signal";
const btn = "border px-3 py-1 text-[11px] uppercase tracking-widest outline-none focus-visible:ring-1 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-40";

export function SettingsDialog({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [draft, setDraft] = useState<DesktopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  // Daftar model dari akun provider: null = belum/sedang diambil.
  const [models, setModels] = useState<{ value: string; name: string }[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    window.simply?.getSettings().then((i) => { if (alive) { setInfo(i); setDraft(i.settings); } })
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (draft) firstRef.current?.focus(); }, [draft === null]);
  // Daftar model hanya diambil setelah token terisi, dan diambil ulang saat token diganti.
  const hasClaude = !!info?.tokenSet.claude;
  const [tokenRev, setTokenRev] = useState(0);
  useEffect(() => {
    if (!hasClaude) { setModels(null); setModelsError(null); return; }
    let alive = true;
    setModels(null); setModelsError(null);
    window.simply?.claudeInfo().then((r) => { if (!alive) return; if (r.ok) setModels(r.models); else setModelsError(r.error); })
      .catch((e) => alive && setModelsError(String(e)));
    return () => { alive = false; };
  }, [hasClaude, tokenRev]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!info || !draft) {
    return <Shell onClose={onClose}><p className="p-6 text-xs text-dim">{error ?? "Memuat pengaturan…"}</p></Shell>;
  }

  const set = <K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) => setDraft({ ...draft, [k]: v });
  // Tampilkan folder yang benar-benar dipakai (bisa berbeda dari yang tersimpan: terkunci env atau fallback),
  // kecuali pengguna sedang memilih yang baru.
  const picking = draft.workspace !== info.settings.workspace;
  const shownWorkspace = picking ? (draft.workspace ?? info.defaultWorkspace) : info.effectiveWorkspace;
  const workspaceChanged = (draft.workspace ?? info.defaultWorkspace) !== (info.settings.workspace ?? info.defaultWorkspace);

  const choose = async () => {
    setError(null);
    const r = await window.simply!.chooseWorkspace();
    if ("error" in r) setError(r.error);
    else if ("path" in r) set("workspace", r.path);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.simply!.saveSettings({ ...draft, setupDone: true });
      if (!r.ok) { setError(r.error); return; }
      if (r.restart) { setRestarting(true); return; }
      const failed = Object.entries(r.pluginErrors);
      if (failed.length) {
        // Pengaturan sudah tersimpan; agent tetap jalan tanpa plugin yang gagal diunduh.
        setError(`Plugin gagal diunduh (${failed.map(([id, m]) => `${id}: ${m}`).join("; ")}). Agent jalan tanpa plugin itu.`);
        window.simply!.getSettings().then(setInfo).catch(() => {});
        return;
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveToken = async (provider: string) => {
    setError(null);
    const r = await window.simply!.setToken(provider, tokens[provider] ?? "");
    if (!r.ok) { setError(r.error); return; }
    setTokens({ ...tokens, [provider]: "" });
    setInfo({ ...info, tokenSet: { ...info.tokenSet, [provider]: !!tokens[provider]?.trim() } });
    if (provider === "claude") setTokenRev((n) => n + 1);
  };

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

  return (
    <Shell onClose={onClose}>
      <h2 id="settings-title" className="border-b border-signal/20 px-5 py-3 font-display text-[15px] uppercase tracking-[0.3em] text-zinc-100">pengaturan</h2>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4 text-xs">
        {!info.settings.setupDone && (
          <p role="note" className="border border-signal/40 px-2 py-1 text-[11px] text-zinc-100">
            Pengaturan awal: pilih plugin dan isi token provider, lalu simpan. Semuanya bisa diubah lagi lewat ⚙ pengaturan.
          </p>
        )}

        <section>
          <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">nama panggilan</h3>
          <input type="text" maxLength={40} autoComplete="off" placeholder="mis. Bimmo (opsional)" value={draft.nickname}
            onChange={(e) => set("nickname", e.target.value)} className={field} aria-label="Nama panggilan" />
          <p className="mt-1 text-[10px] text-dim">Dipakai untuk menyapa Anda di halaman utama. Hanya disimpan di komputer ini.</p>
        </section>

        <section>
          <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">plugin agent</h3>
          <p className="mb-2 text-[10px] text-dim">
            Diunduh otomatis saat dipilih dan dicek sebelum tiap agent jalan. Hanya untuk agent Claude; Codex dan Gemini tidak memakai plugin.
            Tiap plugin menambah token per giliran, jadi pilih seperlunya.
          </p>
          <div className="space-y-1">
            {info.plugins.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={draft.plugins.includes(p.id)} className="mt-0.5 accent-[#22d3ee]"
                  onChange={(e) => set("plugins", e.target.checked ? [...draft.plugins, p.id] : draft.plugins.filter((x) => x !== p.id))} />
                <span>
                  <span className="text-zinc-100">{p.name}</span>{" "}
                  <span className={p.installed ? "text-green-400" : "text-dim"}>{p.installed ? "terpasang" : "belum diunduh"}</span>
                  <span className="block text-[10px] text-dim">{p.desc}</span>
                  {p.warn && <span className="block text-[10px] text-amber-300">{p.warn}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">token provider</h3>
          <p className="mb-2 text-[10px] text-dim">
            Wajib untuk tiap provider yang dipakai agent. Claude: jalankan <code className="text-zinc-100">claude setup-token</code> lalu tempel hasilnya.
            Codex: API key OpenAI. Gemini: API key Gemini. Token disimpan di komputer ini dan tidak ditampilkan lagi. Kosongkan lalu klik pasang untuk menghapus.
          </p>
          <div className="grid grid-cols-[70px_1fr_auto] items-center gap-x-2 gap-y-1">
            {["claude", "codex", "gemini"].map((p) => (
              <label key={p} className="contents">
                <span className="text-zinc-100">{p} <span className={info.tokenSet[p] ? "text-green-400" : "text-amber-300"}>{info.tokenSet[p] ? "✓" : "kosong"}</span></span>
                <input type="password" autoComplete="off" spellCheck={false} placeholder={info.tokenSet[p] ? "terisi; tempel untuk mengganti" : "tempel token"}
                  value={tokens[p] ?? ""} onChange={(e) => setTokens({ ...tokens, [p]: e.target.value })} className={field} aria-label={`Token ${p}`} />
                <button onClick={() => saveToken(p)} disabled={!tokens[p]?.trim() && !info.tokenSet[p]} className={`${btn} border-signal/40 text-zinc-100 hover:bg-signal/10`}>pasang</button>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">workspace</h3>
          <p className="mb-2 break-all text-zinc-100" data-testid="workspace-path">{shownWorkspace}</p>
          <div className="flex gap-2">
            <button ref={firstRef} onClick={choose} disabled={info.workspaceLocked || restarting}
              className={`${btn} border-signal/40 text-zinc-100 hover:bg-signal/10`}>pilih folder…</button>
            <button onClick={() => set("workspace", null)} disabled={info.workspaceLocked || restarting || draft.workspace === null}
              className={`${btn} border-signal/30 text-dim hover:bg-signal/10`}>pakai folder bawaan</button>
          </div>
          {info.workspaceLocked && <p className="mt-1 text-[10px] text-amber-300">Dikunci oleh variabel SIMPLY_WORKSPACE.</p>}
          {workspaceChanged && <p className="mt-1 text-[10px] text-amber-300">Mengganti workspace memulai ulang app. Antrean tersimpan.</p>}
          <p className="mt-1 text-[10px] text-dim">Agent hanya bisa membaca dan (mode baca+tulis) mengubah file di dalam folder ini.</p>
        </section>

        <fieldset>
          <legend className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">akses agent</legend>
          {(["read-only", "all"] as ToolMode[]).map((m) => (
            <label key={m} className="mb-1 flex cursor-pointer items-start gap-2">
              <input type="radio" name="toolMode" checked={draft.toolMode === m} onChange={() => set("toolMode", m)} className="mt-0.5 accent-[#22d3ee]" />
              <span>
                <span className="text-zinc-100">{m === "read-only" ? "Hanya baca (aman)" : "Baca + tulis"}</span>
                <span className="block text-[10px] text-dim">
                  {m === "read-only"
                    ? "Read, Glob, Grep di dalam workspace."
                    : "Edit dan Write di dalam workspace, plus Bash dengan allowlist di sandbox OS dan akses web."}
                </span>
              </span>
            </label>
          ))}
          {draft.toolMode === "all" && (
            <p role="note" className="mt-1 border border-amber-400/40 px-2 py-1 text-[10px] text-amber-300">
              {info.platform !== "linux" && info.platform !== "darwin" && "Di sistem ini sandbox Bash mungkin tidak tersedia; kalau begitu Bash ditolak. "}Agent bisa mengubah file di workspace. Bash butuh sandbox OS; di Ubuntu 24.04+ sandbox bisa gagal dan Bash ditolak (Edit dan Write tetap jalan). Mode ini juga memuat semua tool, jadi tiap giliran agent jauh lebih mahal (terukur sekitar 10 kali lipat untuk tugas pendek).
            </p>
          )}
        </fieldset>

        <section className="grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-dim">Batas token (0 = tanpa batas)</span>
            <input type="number" min={0} step={1000} placeholder="0" value={draft.tokenBudget === 0 ? "" : draft.tokenBudget} onChange={(e) => set("tokenBudget", Math.max(0, Math.floor(num(e.target.value))))} className={field} aria-label="Batas token" />
          </label>
          <label>
            <span className="mb-1 block text-dim">Batas biaya USD (0 = tanpa batas)</span>
            <input type="number" min={0} step={0.5} placeholder="0" value={draft.budgetUsd === 0 ? "" : draft.budgetUsd} onChange={(e) => set("budgetUsd", Math.max(0, num(e.target.value)))} className={field} aria-label="Batas biaya USD" />
          </label>
        </section>

        <section>
          <h3 className="mb-1 font-display text-[12px] uppercase tracking-[0.25em] text-signal">model per agent</h3>
          {!hasClaude ? (
            <p data-testid="models-hint" className="text-[10px] text-amber-300">Isi token dulu di bagian token provider. Setelah itu daftar model dan pilihan per agent muncul di sini, diambil dari akun Anda.</p>
          ) : models === null && !modelsError ? (
            <p role="status" className="text-[10px] text-dim">Mengambil daftar model dari akun Claude…</p>
          ) : (
            <>
              <p className="mb-2 text-[10px] text-dim">
                Berlaku mulai giliran berikutnya. Daftar model diambil dari akun Claude Anda.
                {modelsError && <span className="block text-amber-300">Gagal mengambil daftar ({modelsError}); memakai daftar bawaan.</span>}
              </p>
              <div className="grid grid-cols-[90px_1fr] items-center gap-x-3 gap-y-1">
                {agents.map((a) => {
                  const current = draft.models[a.id] ?? a.model;
                  const base = models ?? KNOWN_MODELS.map((value) => ({ value, name: value }));
                  const options = base.some((m) => m.value === current) ? base : [{ value: current, name: current }, ...base];
                  return (
                    <label key={a.id} className="contents">
                      <span className="text-zinc-100">{a.name} <span className="text-[10px] text-dim">{a.role}</span></span>
                      <select value={current} onChange={(e) => set("models", { ...draft.models, [a.id]: e.target.value })} className={field} aria-label={`Model ${a.name}`}>
                        {options.map((m) => <option key={m.value} value={m.value}>{m.name === m.value ? m.value : `${m.name} (${m.value})`}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={draft.notifications} onChange={(e) => set("notifications", e.target.checked)} className="accent-[#22d3ee]" />
          <span className="text-zinc-100">Notifikasi desktop saat agent selesai atau error</span>
        </label>
      </div>
      <div className="flex items-center gap-2 border-t border-signal/20 px-5 py-3">
        {restarting
          ? <p role="status" className="text-xs text-amber-300">Memulai ulang app…</p>
          : <>
              {error && <p role="alert" className="mr-auto text-xs text-red-400">{error}</p>}
              <button onClick={onClose} className={`${btn} ml-auto border-signal/30 text-dim hover:bg-signal/10`}>batal</button>
              <button onClick={save} disabled={busy} className={`${btn} border-signal/70 text-cyan-100 hover:bg-signal/20`}>{busy ? "mengunduh…" : "simpan"}</button>
            </>}
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-[min(640px,100%)] border border-signal/50 bg-panel shadow-[0_0_40px_rgba(34,211,238,0.2)]">
        {children}
      </div>
    </div>
  );
}
