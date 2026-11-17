#!/usr/bin/env bash
# Membangun paket .deb dari nol dengan satu perintah: bash scripts/build-deb.sh
# Hasil: desktop/release/simply-agent_<versi>_amd64.deb
set -euo pipefail
cd "$(dirname "$0")/.."

# Terminal VS Code mewarisi variabel ini; membuat Electron jalan sebagai Node biasa dan merusak build.
unset ELECTRON_RUN_AS_NODE

need() { command -v "$1" >/dev/null 2>&1 || { echo "Butuh '$1' tetapi tidak ditemukan."; exit 1; }; }
need node; need npm; need dpkg-deb; need fakeroot

# Build butuh Node 22+ (electron-builder, Vite 8, dan tes desktop yang memakai type stripping bawaan Node).
node -e 'const v=process.versions.node.split(".").map(Number);
if (v[0] < 22 || (v[0] === 22 && v[1] < 18)) { console.error("Node " + process.versions.node + " terlalu lama. Pakai Node >= 22.18."); process.exit(1); }'

for d in server ui desktop; do
  if [ ! -d "$d/node_modules" ]; then
    echo "== npm ci: $d"
    (cd "$d" && npm ci --no-audit --no-fund)
  fi
done

echo "== ikon"
(cd desktop && node scripts/make-icon.mjs)

echo "== build UI, bundle app, dan paket .deb"
(cd desktop && npm run dist)

echo
ls -lh desktop/release/*.deb
echo "Pasang: sudo apt install ./desktop/release/simply-agent_*_amd64.deb"
