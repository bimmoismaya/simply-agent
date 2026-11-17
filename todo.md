# TODO: Simply Agent UI

## Prompt: UI generation (paste to any AI coding tool, attach reference frames)

````
Build a single-page web app: a dark "mission control" UI for orchestrating multiple AI coding agents on an infinite node canvas. Use React + TypeScript + Vite, Tailwind CSS, and React Flow (@xyflow/react) for the canvas. Use mock data only; no backend yet. Reference screenshots are attached: match their mood, density and line style.

## Visual concept (important: do NOT produce a generic SaaS dashboard)
- Aesthetic: dark sci-fi command center / terminal-native. Think "air traffic control meets tmux". Near-black background (#07070A) with a very subtle dot grid and a faint vignette.
- One accent color: signal red (#FF3B30 range) with glow. Secondary: dim warm gray text. Status colors used sparingly: green (running), amber (waiting), gray (idle), red (error).
- Typography: monospace for everything functional (JetBrains Mono or Geist Mono), plus one condensed or wide display face for headers. Do NOT use Inter or system defaults.
- Shapes: sharp or 2px corners, 1px hairline borders in red at low opacity, no soft white cards, no purple gradients, no big rounded-2xl panels.
- Edges between nodes: thin red curved lines with glowing animated pulses travelling along them to show messages passing between agents.
- Motion: subtle only. Pulsing status dot, typing cursor on streaming text, edge pulses, 150ms fades. No bouncy animations.

## Layout
1. Full-screen React Flow canvas (pan/zoom, minimap bottom-right in the same style).
2. Left sidebar (collapsible, 260px): agents grouped by role with counts, e.g. COORDINATOR 1/1, REVIEWERS 2/2, FRONTEND 2/2, TESTERS 1/2. Each row: pixel-art robot icon (small red space-invader style glyph), agent name, model tag, status dot + label (running / idle / waiting). Clicking a row focuses and zooms to that node.
3. Agent nodes on the canvas (cards ~320x220): header with icon, name, role badge, model (e.g. "Claude Opus 5.5"), status; body is a terminal-style live log (last ~6 lines, monospace, streaming effect); footer shows current task and token/time counter. Selected node gets a stronger red glow.
4. Coordinator node larger, centered, with edges fanning out to the others. Include one "preview" node (an embedded image/video frame) like in the reference.
5. Bottom command bar, centered, floating: input "Command 8 agents · @ to direct…". Typing "@" opens an autocomplete of agent names. Buttons: send, mic icon, and quick-action chips (Plan, Review, Test, Stop all).
6. Right drawer (opens on node click, 380px): full log of that agent, current task, files touched, and Pause / Retry / Kill buttons.
7. Top-left tiny wordmark and top-right session timer + total token counter.

## Mock data (put in src/mockData.ts)
8 agents: Pip (coordinator), Otto (coordinator-assistant), Dax and Maya (reviewers), Juno and Ada (frontend), plus 2 testers. Each with id, name, role, model, status, task, log lines[], tokens, startedAt. Plus an edges array {from, to, label}. Simulate live behaviour with a setInterval that appends log lines and randomly changes statuses.

## Data contract (keep these TypeScript types in src/types.ts so a real backend can replace the mock later)
type AgentStatus = "running" | "idle" | "waiting" | "error" | "done"
interface Agent { id; name; role; model; status; task; log: string[]; tokens: number; startedAt: number }
interface AgentEdge { id; from; to; label?; active?: boolean }
Isolate data access in one hook, useAgents(), which returns { agents, edges, sendCommand(text, targetIds?) }, so swapping the mock for a WebSocket later touches only that file.

## Quality bar
- Fully responsive down to a laptop; the canvas must stay usable.
- Keyboard: "/" focuses the command bar, Esc closes the drawer, arrow keys navigate agents.
- Accessible contrast; respect prefers-reduced-motion.
- Clean component structure (components/, hooks/, types.ts), no giant single file.
- Deliver a runnable project: `npm install && npm run dev`.
````

## Status ringkas (diperbarui setelah Fase 10)

| Fase | Status | Catatan |
|---|---|---|
| 0 Setup | Selesai | Plugin terpasang, `rea` diperbaiki (Node 24) |
| 1 Referensi dan UI | Selesai (UI dibuat di repo ini) | Desain final dari alat lain bersifat opsional |
| 2 Backend satu agent | Selesai | Diuji dengan agent sungguhan |
| 3 Multi-agent | Selesai | Delegasi lewat tool `delegate` terstruktur |
| 4 Agent lain dan polish | **Sebagian** | Codex/Gemini belum teruji; `claude-security` belum dijalankan |
| 5 Tutup kekurangan | Selesai, kecuali 2 item di Fase 4 | Verifikasi, kontrol UI, keamanan dasar |
| 6 Sisa pekerjaan | Selesai, kecuali Codex/Gemini, `claude-security`, `git init`, desain final | USD, antrean persisten, tes UI di repo |
| 7 Fondasi Electron | Selesai (GO) | Keamanan jendela teruji |
| 8 Integrasi desktop | Selesai | Tray, notifikasi, menu, dan dialog sistem belum dilihat langsung |
| 9 Paket `.deb` | **Dibangun, menunggu pasang dengan sudo** | Lolos pemeriksaan statis dan simulasi apt |
| 10 Uji akhir dan dokumentasi | Selesai, kecuali AppImage (opsional) | Build dari nol satu perintah |

Angka tes terakhir: server 22, desktop 9, smoke Electron 54 cek, smoke web lulus. Semua typecheck bersih.

Daftar pekerjaan yang masih terbuka ada di bagian paling bawah.

## Fase

### Fase 0: Setup (selesai)
- [x] Pasang plugin dan tulis README, CLAUDE.md, `scripts/setup-plugins.sh`, `.claude/settings.json`
- [x] Tulis prompt UI di file ini
- [x] Perbaiki MCP server `rea` (`CONNECTION_CLOSED`): penyebabnya Node 22.22.1 terlalu lama. Node 24.22.3 dipasang di `~/.local/node`, symlink di `~/.local/bin/node`. Restart Claude Code untuk memuat ulang

### Fase 1: Referensi dan UI
- [x] Ekstrak frame resolusi tinggi dari video referensi (bagian kanvas node dan panel agent)
- [~] Generate UI dengan prompt di atas di alat lain: tidak dilakukan; UI dibuat langsung di `ui/` dan mengikuti prompt. Opsional kalau Anda ingin desain lain
- [x] UI ada di repo ini (`ui/`, React + React Flow + Tailwind)
- [x] Jalankan `npm install && npm run dev`, cek tampilan dengan data palsu
- [ ] (Anda) Lihat UI dan beri koreksi visual spesifik kalau ada
- Selesai bila: UI jalan lokal dan tampilannya disetujui (jalan lokal: ya; persetujuan visual: menunggu Anda)

### Fase 2: Backend satu agent
- [x] Buat server (TypeScript) dengan WebSocket
- [x] Jalankan satu agent Claude lewat Claude Agent SDK, stream output ke UI
- [x] Ganti mock di `useAgents()` dengan koneksi WebSocket (hanya file itu yang berubah)
- [x] Tentukan aturan izin tool (baca, tulis file, jalankan perintah)
- Selesai bila: satu kartu agent menampilkan log live dari agent sungguhan

### Fase 3: Multi-agent
- [x] Jalankan beberapa agent paralel dengan peran (koordinator, reviewer, frontend, tester)
- [x] Koordinator membagi tugas dan menerima hasil; edge di kanvas menyala saat pesan lewat
- [x] `sendCommand(text, targetIds)` dan `@agent` mengarahkan tugas ke agent tertentu
- [x] Tombol Pause / Retry / Kill bekerja
- [x] Batas biaya: tampilkan token per agent, beri batas maksimum per sesi
- Selesai bila: satu perintah dibagi ke 3+ agent dan hasilnya kembali ke koordinator

### Fase 4: Agent lain dan polish
- [~] Adapter Codex dan Gemini: kode ada dan streaming per baris, tapi CLI belum terpasang di mesin ini sehingga belum pernah diuji (lihat Terbuka #4)
- [x] Simpan dan lanjutkan sesi
- [x] Polish visual: glow, edge berdenyut dengan label, minimap, bingkai grup, `prefers-reduced-motion`. Performa dengan banyak node (puluhan) belum diukur
- [ ] Review keamanan dengan `claude-security` (lihat Terbuka #3)
- Selesai bila: agent dari lebih dari satu penyedia jalan bersama di satu kanvas (belum: hanya provider Claude yang teruji)

### Fase 5: Tutup kekurangan dan verifikasi
Sumber: bagian "Kekurangan yang diketahui" di [README.md](README.md).

**5a. Verifikasi (prioritas tertinggi)**
- [x] Cek UI di browser setelah fix `ReactFlowProvider`: kanvas, sidebar, command bar, dan klik sidebar memfokus node
- [x] Unit test routing `DELEGATE:` (format valid, format rusak, nama tidak ada) dengan provider palsu, tanpa memanggil model
- [x] Unit test pause (tugas antrean tertahan), resume, dan kill (giliran dibatalkan)
- [x] Script e2e kecil: satu tugas ke Pip, verifikasi state tersimpan dan event sampai ke klien WebSocket

**5b. Kontrol agent di UI**
- [x] Drawer kanan 380px saat node diklik: log lengkap, tugas aktif, file yang disentuh
- [x] Tombol Pause/Resume, Retry, Kill per node di drawer
- [x] Keputusan: Pause hanya menahan antrean, giliran yang sedang jalan tidak dihentikan (sudah sesuai implementasi). Tampilkan ini di tombol/tooltip UI
- [x] Batas token: tampilkan sisa budget di bar atas, dan ubah status `waiting` jadi terlihat di kartu

**5c. Spesifikasi UI yang belum ada**
- [x] Bar atas: timer sesi dan total token
- [x] Pintasan: `/` fokus command bar, `Esc` tutup drawer, panah pindah antar agent
- [x] `prefers-reduced-motion` mematikan animasi edge dan pulse
- [x] Label pada edge, dan preview node (frame video atau gambar)
- [x] Layout otomatis, bukan koordinat tetap

**5d. Codex dan Gemini**
- [ ] (Anda) Pasang dan login CLI `codex` dan `gemini`, lalu uji adapter `server/src/providers/cli.ts` dengan tugas sungguhan. Belum bisa dari sini karena butuh login
- [x] Streaming keluaran CLI per baris
- [x] Token provider CLI ditandai `n/a` di UI

**5e. Keamanan**
- [x] Autentikasi token untuk WebSocket, walaupun hanya `127.0.0.1`
- [x] Sandbox untuk mode baca+tulis: allowlist, larangan perangkai perintah, dan sandbox OS fail-closed (lihat Fase 6b dan 9 untuk hasil di mesin ini)
- [ ] Jalankan `claude-security` pada repo, lalu tangani temuan (lihat Terbuka #3)
- [x] Pastikan `workspace/` tidak bisa keluar ke root repo lewat `Read` atau `Bash`

**5f. Repo**
- [x] Keputusan: belum commit/push, kerja lokal dulu. `git init` nanti saat siap

Selesai bila: 5a sampai 5e tercentang. Sisa: Codex/Gemini (5d) dan `claude-security` (5e).

### Fase 6: Sisa pekerjaan
Lanjutan dari item Fase 5 yang belum selesai, ditambah kekurangan di README.

**6a. Provider lain (butuh Anda)**
- [ ] (Anda) Pasang dan login CLI `codex` dan `gemini`
- [ ] Uji adapter `server/src/providers/cli.ts` dengan tugas sungguhan, sesuaikan argumen CLI kalau perlu (butuh langkah di atas)
- [ ] Ganti satu agent ke `codex` atau `gemini` di `agents.config.ts`, pastikan jalan bersama agent Claude di satu kanvas

**6b. Keamanan**
- [ ] Putuskan: jalankan `claude-security` sekarang atau nanti (biaya token beberapa agent Opus)
- [ ] Jalankan `claude-security`, tangani temuan
- [x] Sandbox OS (bubblewrap bawaan SDK) untuk Bash saat `AGENT_TOOLS=all`: tulis hanya `workspace/`, jaringan dibatasi, file rahasia diblokir, fail-closed
- [x] Sandbox gagal di mesin ini karena AppArmor membatasi user namespace bersarang. Keputusan: mode hanya-baca jadi bawaan, mode baca+tulis memberi peringatan, Bash gagal-tertutup. `AGENT_SANDBOX=off` tidak dipakai. Profil AppArmor untuk bwrap bersifat opsional (Terbuka #5)

**6c. Keandalan delegasi dan biaya**
- [x] Ganti parsing teks `DELEGATE:` dengan tool `delegate` terstruktur (MCP in-process lewat `createSdkMcpServer`), supaya tidak bergantung format keluaran model
- [x] Biaya dalam USD dari `total_cost_usd` hasil SDK, tampilkan di bar atas dan drawer; budget bisa dalam USD
- [x] Simpan antrean ke state supaya tidak hilang saat server restart

**6d. UI**
- [x] Bingkai grup selalu pas: tinggi kartu dibuat tetap (`CARD_H`/`BIG_H`) alih-alih diukur, dicek di smoke test
- [x] Minimap lebih terlihat (warna node grup dan agent)
- [x] Pindahkan script cek browser (Chrome headless: screenshot, klik, pintasan, console) ke repo sebagai tes UI, mis. `ui/scripts/smoke.mjs`
- [ ] Ganti `ui/` dengan desain final dari alat lain kalau sudah ada (tetap pakai `useAgents()`)

**6e. Repo**
- [ ] (Anda) `git init` dan commit pertama saat siap. Keputusan: lokal dulu, belum ada push ke GitHub

Selesai bila: agent dari lebih dari satu provider jalan bersama, `claude-security` bersih atau temuannya ditangani, dan tes UI masuk repo. Tes UI sudah masuk repo; dua syarat lainnya masih terbuka.

Catatan hasil uji sungguhan: tool `delegate` jalan (Pip ke Dax, edge menyala). Satu giliran Pip dengan Opus sekitar USD 0,27. Bawaan Pip sekarang Sonnet (diubah di `agents.config.ts`).

### Fase 7: Fondasi Electron (mode dev)
Target: app desktop Ubuntu dalam format `.deb`. Folder baru `desktop/`.
- [x] Proyek `desktop/` (Electron + TypeScript), skrip `npm start` (di folder `desktop/`) membuka jendela yang memuat UI
- [x] Proses utama menjalankan server engine (`startServer`) di port acak `127.0.0.1`, dengan token acak per sesi
- [x] Token dan port diteruskan ke UI lewat preload (IPC), bukan lewat URL; `useAgents()` membacanya kalau ada
- [x] Keamanan Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP ketat, blokir navigasi dan jendela baru ke luar app
- [x] Server dimatikan rapi saat jendela ditutup
- Selesai bila: `npm start` (di folder `desktop/`) membuka UI yang `live`, dan smoke test UI lulus terhadap jendela Electron
- Hasil (go/no-go: **GO**): `cd desktop && npm start` membuka app; `npm run smoke` lulus berturut-turut (sekarang 54 cek karena ikut mencakup Fase 8); app jadi (`npm run pack`) menjalankan agent sungguhan lewat `node scripts/e2e-packaged.mjs` (USD 0,014).
- Bug nyata yang ketemu dan sudah diperbaiki: semua edge kanvas hilang permanen setelah update agent (node tanpa `measured` di React Flow v12). Cek regresinya ada di `ui/scripts/checks.mjs`.

### Fase 8: Integrasi desktop
- [x] Dialog pilih folder workspace (menggantikan env `WORKSPACE`), disimpan di pengaturan
- [x] Pengaturan tersimpan di folder data pengguna (`~/.config/<app>`): workspace, `TOKEN_BUDGET`, `BUDGET_USD`, mode tool (read-only / all), model per agent
- [x] State engine dipindah ke folder data pengguna, bukan di dalam workspace
- [x] Cek login Claude saat start; kalau belum login, tampilkan petunjuk jelas, bukan error diam
- [x] Notifikasi desktop saat agent selesai atau error, dan saat budget tercapai
- [x] Ikon tray, satu instance saja, menu aplikasi dasar
- Selesai bila: app bisa dipakai penuh tanpa terminal dan tanpa mengubah env
- Hasil: `npm run smoke` di folder `desktop/` 54 cek lulus (3 run berturut-turut), termasuk dialog Pengaturan, validasi di proses utama, persistensi lintas restart, state terpisah dari workspace, satu instance, dan banner login. 9 unit test desktop dan 22 tes server lulus.
- Bug nyata yang ketemu lewat smoke: dialog menampilkan workspace bawaan, bukan yang dipakai saat dikunci env; kolom angka menampilkan "02.5". Keduanya sudah diperbaiki.
- Tidak bisa diverifikasi tanpa desktop sungguhan: ikon tray, notifikasi, menu aplikasi, dialog pilih folder, dan dialog konfirmasi tutup. Logikanya diuji lewat unit test.

### Fase 9: Paket `.deb`
- [x] Server dikompilasi ke JavaScript dengan esbuild (`desktop/scripts/build.mjs`), tanpa `tsx` di app jadi
- [x] Binary Claude Agent SDK ikut terbungkus di luar asar (`asarUnpack`) dan terbukti jalan dari paket. Versi musl dibuang. Catatan ukuran: binary `claude` 366 MB, jadi `resources/` 355 MB dan paket sekitar 620 MB terpasang
- [x] `electron-builder` target `deb`: nama paket `simply-agent`, folder `/opt/simply-agent` (tanpa spasi), ikon robot piksel, entri menu, `desktopName`
- [x] Profil AppArmor dan izin `chrome-sandbox`: dipasang oleh `postinst` bawaan electron-builder 26 (profil di `resources/apparmor-profile`, dihapus di `postrm`). Simulasi `apt-get -s install` bersih
- [x] Keputusan sandbox Bash: tidak membuat profil AppArmor sendiri untuk bwrap. Default app adalah mode hanya-baca; mode baca+tulis memberi peringatan jelas di Pengaturan, dan Bash gagal-tertutup kalau sandbox tidak jalan. Data pembanding sebelum instalasi: agent sungguhan jalan dari app jadi; Bash gagal-tertutup dengan `apply-seccomp ... nested userns is capability-restricted`, tidak ada yang lolos ke luar workspace
- [ ] (Anda) Pasang `.deb` dengan sudo (Terbuka #1). Lalu saya jalankan `node desktop/scripts/e2e-packaged.mjs /opt/simply-agent/simply-agent --bash-sandbox`, cek profil AppArmor, dan uji hapus tanpa sisa
- Selesai bila: `sudo apt install ./agent-*.deb` menghasilkan app yang bisa dibuka dari menu dan menjalankan satu tugas agent
- Status: paket `desktop/release/simply-agent_0.1.0_amd64.deb` (240 MB) sudah dibangun; menunggu pemasangan

### Fase 10: Uji akhir dan dokumentasi
- [x] Smoke test Electron (`desktop/scripts/smoke.mjs`) dan e2e app jadi dengan agent sungguhan (`desktop/scripts/e2e-packaged.mjs`) masuk repo
- [x] Tes: restart memulihkan sesi dan pengaturan, tutup jendela menghentikan app, instance kedua ditolak (semua di smoke Electron); pemulihan antrean diuji di tes server
- [x] Keputusan update: manual (bangun `.deb` baru lalu `apt install` di atasnya). Tanpa auto-update
- [ ] Opsional, tidak dikerjakan: target AppImage untuk distro lain. Binary `claude` 366 MB membuatnya berat, dan target saat ini hanya Ubuntu
- [x] README: cara build, pasang, hapus, dan lokasi data pengguna
- Selesai bila: build `.deb` dari nol memakai satu perintah, dan semua tes (server, UI, desktop) lulus
- Hasil: `bash scripts/build-deb.sh` di salinan repo bersih (tanpa node_modules) menghasilkan `.deb` 229 MB dalam 1,5 menit.

### Masih terbuka (urut prioritas)

1. **(Anda) Pasang paket dengan sudo**, lalu saya selesaikan verifikasi Fase 9:
   ```
   cd /home/nusapala/git/agent
   sudo apt install ./desktop/release/simply-agent_0.1.0_amd64.deb
   ```
   Setelah Anda kabari, saya jalankan e2e app terpasang (sekitar USD 0,07), cek profil AppArmor `/etc/apparmor.d/simply-agent`, entri menu, dan uji `sudo apt remove` tanpa sisa. Hasil sandbox Bash dibandingkan dengan data pembanding di Fase 9.
2. **(Anda) Lihat langsung** hal yang tidak bisa diuji tanpa tampilan desktop: ikon tray (klik, menu), notifikasi desktop saat agent selesai dengan jendela tidak difokuskan, menu aplikasi (Ctrl+, untuk Pengaturan), dialog pilih folder workspace, dan dialog konfirmasi saat menutup jendela dengan agent berjalan. Kabari yang tidak sesuai.
3. **Putuskan dan jalankan `claude-security`**: scan memakai beberapa agent Opus, jadi biayanya jauh lebih besar dari uji biasa. Hasilnya ditangani di Fase 4 dan 5e.
4. **(Anda) Pasang dan login CLI `codex` dan `gemini`**, lalu saya uji adapter, sesuaikan argumen CLI, dan jalankan satu agent non-Claude bersama agent Claude (Fase 4, 5d, 6a).
5. **Opsional: membuat Bash bisa dipakai di app.** Pilihan: profil AppArmor untuk `bwrap` yang dipasang `postinst` (butuh root saat instalasi, jadi masuk akal di `.deb`), atau menjalankan server di container. Sampai itu dilakukan, mode baca+tulis hanya memberi Edit dan Write.
6. **Opsional lain:**
   - Desain UI final dari alat lain (tetap lewat `useAgents()`), jika Anda tidak puas dengan tampilan sekarang.
   - Target AppImage untuk distro lain (berat karena binary `claude` 366 MB).
   - Ukur performa kanvas dengan puluhan node.
   - `git init` dan commit pertama (keputusan: lokal dulu).

### Catatan penting
- Pause hanya menahan antrean; giliran yang sedang jalan tetap selesai (keputusan Anda, lihat 5b).
- Mode baca+tulis memuat semua tool sehingga tiap giliran sekitar 10 kali lebih mahal dari mode hanya-baca (terukur USD 0,13 vs 0,014 untuk tugas pendek). Pakai budget USD di Pengaturan.
- Data pengguna app ada di `~/.config/simply-agent/` dan tidak dihapus oleh `apt remove`.
- Update app: manual (bangun `.deb` baru dengan `bash scripts/build-deb.sh`, lalu `apt install` di atasnya).
