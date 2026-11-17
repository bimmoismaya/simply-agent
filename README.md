# Simply Agent

Multi-agent dengan UI kanvas node bergaya "mission control". Rencana dan prompt UI ada di [todo.md](todo.md).

## WAJIB: setup plugin sebelum mengerjakan tugas apa pun

Kalau repo ini dibuka di laptop/mesin baru, AI (Claude Code) **harus** membaca file ini dan memastikan semua plugin di bawah sudah terpasang **sebelum** mengerjakan tugas. Jangan mulai bekerja sebelum langkah ini selesai.

### Daftar plugin

| Plugin | Marketplace | Sumber | Fungsi |
|---|---|---|---|
| humanizer | `humanizer` | `blader/humanizer` | Menulis ulang teks agar tidak terdengar seperti AI |
| antislop | `anti-slop` | `miqdadbadjuber/anti-slop` | Aturan anti "AI slop" untuk UI, copy, dan kode (6 skill + MCP kontras warna, butuh Python 3) |
| ponytail | `ponytail` | `dietrichgebert/ponytail` | Mode "senior malas": solusi paling sederhana yang berfungsi |
| superpowers | `superpowers-dev` | `obra/superpowers` | Skill TDD, debugging, dan alur kerja kolaborasi |
| caveman | `caveman` | `juliusbrussee/caveman` | Mode komunikasi ringkas (butuh Node.js) |
| ui-ux-pro-max | `ui-ux-pro-max-skill` | `nextlevelbuilder/ui-ux-pro-max-skill` | Basis data gaya, palet, font, dan panduan UI/UX |
| last30days | `last30days-skill` | `mvanhorn/last30days-skill` | Riset topik dari Reddit, X, YouTube, HN, dll. (30 hari terakhir) |
| rea | `rea` | `morluto/rea` | Reverse engineering dengan agent (paket npm `rea-agents`). Hanya untuk analisis yang sah, lihat DISCLAIMER di repo-nya |
| claude-code-setup | `claude-plugins-official` | resmi Anthropic | Rekomendasi setup Claude Code |
| claude-security | `claude-plugins-official` | resmi Anthropic | Review keamanan |

### Cara pasang (otomatis)

Dari root repo ini, jalankan:

```bash
bash scripts/setup-plugins.sh
```

Skrip itu idempotent: aman dijalankan berulang, melewati yang sudah terpasang.

Alternatif manual, di dalam Claude Code:

```
/plugin marketplace add blader/humanizer
/plugin marketplace add miqdadbadjuber/anti-slop
/plugin marketplace add dietrichgebert/ponytail
/plugin marketplace add obra/superpowers
/plugin marketplace add juliusbrussee/caveman
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin marketplace add mvanhorn/last30days-skill
/plugin marketplace add morluto/rea

/plugin install humanizer@humanizer
/plugin install antislop@anti-slop
/plugin install ponytail@ponytail
/plugin install superpowers@superpowers-dev
/plugin install caveman@caveman
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
/plugin install last30days@last30days-skill
/plugin install rea@rea
/plugin install claude-code-setup@claude-plugins-official
/plugin install claude-security@claude-plugins-official
```

Setelah terpasang, **restart Claude Code** agar skill dan hook termuat.

### Verifikasi

```bash
claude plugin list
```

Kesepuluh plugin di tabel harus berstatus `enabled`.

### Catatan

- Prasyarat: `claude` CLI, `git`, Node.js, dan Python 3.
- **rea butuh Node.js >= 22.23.4** (atau 24.22.1+, 26.12.1+). Node yang lebih lama membuat MCP `rea` gagal dengan `CONNECTION_CLOSED`. Cek dengan `node -v`. Tanpa sudo: unduh tarball dari nodejs.org ke `~/.local/node`, lalu `ln -sfn ~/.local/node/bin/node ~/.local/bin/node` (pastikan `~/.local/bin` ada di PATH sebelum `/usr/bin`).
- `.claude/settings.json` di repo ini sudah mendeklarasikan marketplace dan plugin di atas, jadi Claude Code akan menawarkan pemasangannya saat repo dipercaya (trust).
- ponytail punya 4 opsi konfigurasi (`/plugin configure ponytail@ponytail`). Webhook kosong secara default, jadi tidak ada data yang keluar dari mesin.
- caveman mengubah gaya jawaban AI menjadi sangat ringkas. Matikan lewat `/plugin disable caveman@caveman` kalau tidak diinginkan.
- Semua plugin pihak ketiga dipasang atas permintaan pemilik repo. Periksa isinya sendiri sebelum memasangnya di mesin lain yang sensitif.

## Status saat ini

Proyek ini menjalankan beberapa agent AI dengan UI kanvas. Rencana lengkap per fase ada di [todo.md](todo.md).

### Struktur

- `shared/types.ts`: kontrak data antara server dan UI (`Agent`, `AgentEdge`, `SessionInfo`, `ServerEvent`, `ClientMessage`).
- `server/src/agents.config.ts`: 8 agent dengan peran tetap (Pip sebagai koordinator; Otto, Dax, Maya, Juno, Ada, Ken, Lia) dan edge dari koordinator ke semua agent. Model per agent diatur di sini.
- `server/src/engine.ts`: antrean tugas per agent, delegasi dari koordinator, pause/resume/retry/kill, batas token dan USD, file yang disentuh, dan penyimpanan state atomik (termasuk antrean) ke `workspace/.engine/state.json`. Runner bisa diganti untuk tes.
- `server/src/policy.ts`: aturan izin tool untuk semua agent (lihat bagian Keamanan).
- `server/src/providers/claude.ts`: satu giliran lewat Claude Agent SDK. Sesi dilanjutkan dengan `resume`. Setiap tool dicek oleh hook `PreToolUse`. Koordinator mendapat tool `delegate` (MCP in-process). Bash jalan di sandbox OS saat `AGENT_TOOLS=all`.
- `server/src/providers/cli.ts`: adapter Codex (`codex exec`) dan Gemini (`gemini -p`) lewat CLI, keluaran di-stream.
- `server/src/index.ts`: WebSocket di `127.0.0.1:8787`, dengan token dan pengecekan origin.
- `server/src/*.test.ts`: 19 tes (policy, engine dengan runner palsu, e2e WebSocket).
- `server/scripts/fake-server.ts`: server dengan runner palsu (tanpa model, tanpa biaya) untuk smoke test UI.
- `ui/scripts/smoke.mjs`: smoke test UI di Chrome headless (20 cek). Screenshot ke `ui/.smoke/`.
- `ui/`: React + React Flow. Data hanya lewat hook `useAgents()`.
- `workspace/`: folder kerja agent. Agent tidak bisa keluar dari folder ini.

### Menjalankan

```
cd /home/nusapala/git/agent/server && npm start
cd /home/nusapala/git/agent/ui && npm run dev
```

Server mencetak URL dengan token, misalnya `http://localhost:5173/?token=3f9a...`. **Buka URL itu**, bukan `localhost:5173` polos. UI menyimpan token per tab dan menghapusnya dari address bar. Token baru dibuat setiap server start, kecuali diset lewat `SIMPLY_TOKEN`.

Tes server: `cd server && npm test`. Smoke test UI: `cd ui && npm run smoke` (butuh Google Chrome; ubah lewat `CHROME_PATH`).

Variabel lingkungan server:

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `8787` | Port WebSocket |
| `WORKSPACE` | `../workspace` | Folder kerja agent |
| `SIMPLY_TOKEN` | acak | Token WebSocket |
| `UI_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origin browser yang diizinkan |
| `TOKEN_BUDGET` | `0` (tanpa batas) | Batas total token; tugas baru ditahan setelah tercapai |
| `BUDGET_USD` | `0` (tanpa batas) | Batas total biaya dalam USD (dari `total_cost_usd` SDK) |
| `AGENT_TOOLS` | read-only | `all` membuka tulis, Bash (allowlist), dan jaringan |
| `BASH_ALLOW` | `ls,cat,head,tail,wc,pwd,node,npm,npx,git` | Perintah Bash yang diizinkan saat `AGENT_TOOLS=all` |
| `SANDBOX_DOMAINS` | `registry.npmjs.org` | Domain yang boleh diakses perintah Bash di sandbox |
| `AGENT_SANDBOX` | aktif | `off` mematikan sandbox OS untuk Bash (tidak disarankan; server mencetak peringatan) |

Variabel UI: `VITE_WS_URL` (default `ws://127.0.0.1:8787`), `VITE_PREVIEW_URL` (opsional, gambar atau video untuk panel preview).

### App desktop (Electron)

Folder `desktop/` membungkus server dan UI jadi satu app. Server jalan di port acak `127.0.0.1` dengan token acak yang dikirim ke UI lewat preload, bukan lewat URL. Semua pengaturan lewat dialog Pengaturan di app; tidak perlu env atau terminal.

**Fitur:** dialog Pengaturan (workspace, mode akses agent, budget token dan USD, model per agent, notifikasi), pengecekan login Claude dengan banner petunjuk, notifikasi desktop saat agent selesai atau error (hanya kalau jendela tidak difokuskan), ikon tray (tampilkan, jeda/lanjutkan antrean, keluar), menu aplikasi, satu instance saja, dan konfirmasi saat menutup jendela kalau masih ada agent berjalan (keluar, sembunyikan ke tray, atau batal).

**Memasang dari paket `.deb` (Ubuntu):**

```
bash scripts/build-deb.sh                                    # bangun dari nol, sekitar 1,5 menit
sudo apt install ./desktop/release/simply-agent_*_amd64.deb
simply-agent                                           # atau cari "Simply Agent" di menu aplikasi
sudo apt remove simply-agent                           # hapus app (data pengguna tetap)
```

Paket berukuran sekitar 230 MB (terpasang sekitar 650 MB) karena membawa binary `claude` milik SDK (366 MB, satu-satunya yang dipakai di Linux x64). Hanya x64 yang dibangun.

**Lokasi data pengguna** (data dari nama lama `agent-orchestrator` dipindahkan otomatis saat app pertama dibuka) (tetap ada setelah `apt remove`; hapus manual kalau ingin bersih):

| Berkas | Isi |
|---|---|
| `~/.config/simply-agent/settings.json` | Pengaturan (izin 0600) |
| `~/.config/simply-agent/state/state.json` | Log, token, biaya, sesi Claude, dan antrean agent |
| `~/.config/simply-agent/workspace/` | Workspace bawaan (bisa diganti di Pengaturan) |

State disimpan di luar workspace, jadi agent tidak bisa membacanya. Login Claude memakai kredensial `claude` yang sudah ada di `~/.claude`; jalankan `claude` di terminal dan login sekali kalau belum.

**Pengembangan dan tes:**

```
cd /home/nusapala/git/agent/desktop
npm start                       # build UI + app, lalu buka jendela
npm run smoke                   # smoke test Electron: runner palsu, tanpa biaya (54 cek)
npm test                        # tes pengaturan, validasi workspace, notifikasi, parser login, path UI
npm run pack                    # app jadi tanpa .deb di release/linux-unpacked/
node scripts/e2e-packaged.mjs [path-app]                  # agent SUNGGUHAN dari app jadi (sekitar USD 0,02)
node scripts/e2e-packaged.mjs [path-app] --bash-sandbox   # ditambah uji sandbox Bash (sekitar USD 0,05 lagi)
```

Smoke test memakai profil dan workspace sementara, jadi tidak menyentuh data app yang sebenarnya.

Terminal VS Code mewarisi `ELECTRON_RUN_AS_NODE=1`, yang membuat Electron jalan sebagai Node biasa. Skrip di `desktop/` dan `scripts/build-deb.sh` sudah menghapusnya; kalau menjalankan Electron manual, hapus dulu variabel itu.

**Update:** manual. Bangun `.deb` baru lalu `sudo apt install` lagi di atas yang lama. Tidak ada auto-update.

**Belum terverifikasi secara visual/otomatis:** ikon tray, notifikasi desktop, menu aplikasi, dan dialog bawaan sistem (pilih folder, konfirmasi tutup) tidak bisa diuji tanpa tampilan desktop sungguhan. Logika di balik notifikasi dan validasi folder diuji lewat unit test; pembuatan tray dicek tidak melempar error.

### Fitur UI

- Kanvas dengan koordinator di tengah dan bingkai grup per peran yang disusun otomatis kiri-kanan.
- Edge merah dengan titik bercahaya saat delegasi lewat, plus label tugas.
- Sidebar per peran, bar atas (status koneksi, jumlah running, timer sesi, total token, biaya USD, dan bar budget).
- Drawer kanan saat agent diklik: status, model, antrean, token dan biaya, tugas, file yang disentuh, log lengkap, tombol Pause/Resume/Retry/Kill.
- Minimap yang menggambar bingkai grup dan agent.
- Command bar dengan `@mention` (Tab untuk melengkapi), chip Plan/Review/Test, dan Stop all.
- Pintasan: `/` fokus command bar, `Esc` tutup drawer, panah pindah antar agent.
- `prefers-reduced-motion` mematikan animasi. Reconnect otomatis tiap 2 detik saat server mati.

### Perilaku kontrol

- **Pause** menahan antrean. Giliran yang sedang jalan tetap diselesaikan (keputusan produk).
- **Kill** membatalkan giliran yang sedang jalan dan mengosongkan antrean.
- **Retry** mengulang tugas terakhir dari awal.
- **Restart server**: antrean dipulihkan dalam keadaan pause, jadi tidak ada token terpakai sebelum Anda menekan Resume.

### Keamanan

- WebSocket hanya bind ke `127.0.0.1`, butuh token (dibandingkan constant-time), dan menolak origin browser selain UI. Situs lain yang terbuka di browser tidak bisa menyambung.
- Pesan dari klien divalidasi dengan zod, ukuran maksimum 64 KB.
- Semua tool agent lewat `checkTool` di hook `PreToolUse`. Hook yang gagal memblokir tool.
  - Default: hanya `Read`, `Glob`, `Grep` di dalam `workspace/`. Path di luar workspace, `..`, dan symlink ke luar ditolak.
  - `AGENT_TOOLS=all`: `Edit`/`Write` (tetap di dalam workspace), `Bash` dengan allowlist dan tanpa perangkai perintah (`;`, `|`, `$()`, dll.), serta `WebFetch`/`WebSearch`.
  - Setiap perintah Bash juga jalan di sandbox OS (bubblewrap): tulis hanya ke `workspace/`, jaringan hanya ke `SANDBOX_DOMAINS`, dan `~/.ssh`, `~/.aws`, `~/.claude/.credentials.json`, dll. tidak bisa dibaca. Kalau sandbox tidak bisa dibuat, perintah gagal (fail-closed), tidak jalan tanpa sandbox.
  - Tool lain, termasuk MCP, ditolak. Pengecualian: `mcp__simply__delegate` untuk koordinator, dan `ToolSearch` (hanya memuat skema; tool yang dimuat tetap dicek).
- Agent tidak memuat `CLAUDE.md` atau setting dari repo induk.
- Diuji dengan model sungguhan: agent yang diminta membaca `/etc/hostname` ditolak hook, dan isinya tidak bocor. Script yang lolos allowlist (`node escape.js`) dan mencoba menulis ke luar workspace tidak berhasil, karena sandbox menolak berjalan (lihat kekurangan).

### Kekurangan yang diketahui

- **Sandbox Bash tidak bisa jalan di mesin ini (Ubuntu 26.04).** AppArmor membatasi user namespace bersarang (`kernel.apparmor_restrict_unprivileged_userns = 1`), jadi bubblewrap gagal dengan `apply-seccomp: ... nested userns is capability-restricted`. Akibatnya, dengan `AGENT_TOOLS=all` setiap perintah Bash gagal (aman, tapi tidak bisa dipakai). Pilihan, semuanya keputusan Anda:
  - Izinkan user namespace untuk bubblewrap lewat profil AppArmor (butuh sudo). Mematikan `kernel.apparmor_restrict_unprivileged_userns` untuk seluruh sistem melemahkan keamanan mesin, jadi tidak disarankan.
  - Jalankan server di container.
  - `AGENT_SANDBOX=off`: Bash jalan hanya dengan allowlist. `npm`, `npx`, dan `node` tetap bisa menjalankan kode apa pun di workspace.
- **Codex dan Gemini belum diuji.** CLI `codex` dan `gemini` belum terpasang dan butuh login. Token dan biaya mereka ditampilkan sebagai `n/a`.
- **Review `claude-security` belum dijalankan.**
- **Biaya koordinator Opus.** Satu giliran sederhana Pip (`claude-opus-5-5`) sekitar USD 0,27 karena prompt sistem dan tool. Pakai `BUDGET_USD`, atau ganti model Pip di `agents.config.ts` kalau terlalu mahal.
- Sesi Claude lama (dibuat sebelum tool `delegate` ada) tetap dilanjutkan. Kalau koordinator bingung soal tool, hapus `workspace/.engine/state.json` untuk mulai sesi baru (log dan antrean ikut hilang).
- Jalur cadangan `DELEGATE:` di teks tetap ada untuk provider CLI, dan bergantung pada format keluaran model.
- Belum ada commit; folder ini belum repo git (keputusan: lokal dulu).
