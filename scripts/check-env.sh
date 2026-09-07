#!/usr/bin/env bash
# Fail if a likely secret is committed to the repo, or if .env is tracked.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "!! .env is tracked by git — remove it."
  fail=1
fi

# Scan tracked files (excluding docs/examples) for obvious secret patterns.
patterns='(BEGIN (RSA |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]{16,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN OPENSSH PRIVATE KEY-----)'
if git grep -nEI "$patterns" -- ':!*.example' ':!docs/**' ':!**/*.md' >/dev/null 2>&1; then
  echo "!! Potential secret found in tracked files:"
  git grep -nEI "$patterns" -- ':!*.example' ':!docs/**' ':!**/*.md' || true
  fail=1
fi

# .env.example must not contain a value that looks real (no '=' followed by long base64-ish).
if grep -nE '^[A-Z_]+=(REPLACE_ME|0|1|)?$' .env.example >/dev/null 2>&1; then
  : # ok — placeholders
fi
if grep -nE '=[A-Za-z0-9+/]{40,}={0,2}$' .env.example >/dev/null 2>&1; then
  echo "!! .env.example appears to contain a real secret value."
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "OK — no obvious committed secrets."
fi
exit "$fail"
