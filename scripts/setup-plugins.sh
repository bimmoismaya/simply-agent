#!/usr/bin/env bash
# Memasang semua plugin Claude Code yang dibutuhkan repo ini. Idempotent.
set -u

command -v claude >/dev/null 2>&1 || { echo "claude CLI tidak ditemukan. Pasang Claude Code dulu."; exit 1; }

MARKETPLACES=(
  blader/humanizer
  miqdadbadjuber/anti-slop
  dietrichgebert/ponytail
  obra/superpowers
  juliusbrussee/caveman
  nextlevelbuilder/ui-ux-pro-max-skill
  mvanhorn/last30days-skill
  morluto/rea
)

PLUGINS=(
  humanizer@humanizer
  antislop@anti-slop
  ponytail@ponytail
  superpowers@superpowers-dev
  caveman@caveman
  ui-ux-pro-max@ui-ux-pro-max-skill
  last30days@last30days-skill
  rea@rea
  claude-code-setup@claude-plugins-official
  claude-security@claude-plugins-official
)

for m in "${MARKETPLACES[@]}"; do
  echo "== marketplace: $m"
  claude plugin marketplace add "$m" 2>&1 | tail -1
done

installed=$(claude plugin list 2>&1)
for p in "${PLUGINS[@]}"; do
  if grep -q "❯ $p" <<<"$installed"; then
    echo "== sudah terpasang: $p"
  else
    echo "== pasang: $p"
    claude plugin install "$p" 2>&1 | tail -1
  fi
done

echo
echo "Selesai. Restart Claude Code agar skill dan hook termuat."
claude plugin list 2>&1 | grep -E "❯|Status"
