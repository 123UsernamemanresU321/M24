#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

printf "24 Arena USB setup in %s\n" "$ROOT"

if [[ "$ROOT" != /Volumes/* ]]; then
  echo "Warning: project is not under /Volumes. For USB-only usage, move it to your USB."
fi

mkdir -p "$ROOT/.npm-cache" "$ROOT/.usb-home"

NPMRC="$ROOT/.npmrc"
touch "$NPMRC"

if ! grep -q '^cache=' "$NPMRC"; then
  echo "cache=.npm-cache" >> "$NPMRC"
fi

if ! grep -q '^audit=' "$NPMRC"; then
  echo "audit=false" >> "$NPMRC"
fi

if ! grep -q '^fund=' "$NPMRC"; then
  echo "fund=false" >> "$NPMRC"
fi

if ! grep -q '^update-notifier=' "$NPMRC"; then
  echo "update-notifier=false" >> "$NPMRC"
fi

if grep -q '^devdir=' "$NPMRC"; then
  TMP_NPMRC="$(mktemp)"
  grep -v '^devdir=' "$NPMRC" > "$TMP_NPMRC"
  mv "$TMP_NPMRC" "$NPMRC"
fi

export HOME="$ROOT/.usb-home"
export npm_config_cache="$ROOT/.npm-cache"
export npm_config_userconfig="$NPMRC"

npm install

echo "Setup complete. Run: npm run dev"
