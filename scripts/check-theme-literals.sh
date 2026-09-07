#!/usr/bin/env bash
# verify:theme guard — component styling must go through design tokens, not literal colours.
# Scans the shared UI kit + the app surfaces for hex / rgb() / hsl() literals in TS/TSX.
# CSS token files and a small allowlist are excluded.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# hex colours (#abc / #aabbcc / #aabbccdd) and rgb()/rgba()/hsl()/hsla( ) function forms
PATTERN='#[0-9a-fA-F]{3,8}\b|(\brgba?\(|\bhsla?\()'

paths=(
  packages/ui/src
  apps/web/src
  apps/site/src
  apps/site/app
)

hits=0
for p in "${paths[@]}"; do
  [ -d "$p" ] || continue
  # only .ts/.tsx; skip tests and story/fixture files
  while IFS= read -r line; do
    hits=1
    echo "$line"
  done < <(grep -rnE "$PATTERN" "$p" \
      --include='*.ts' --include='*.tsx' \
      2>/dev/null \
    | grep -vE '\.test\.tsx?:' \
    | grep -vE '// *theme-ok' \
    || true)
done

if [ "$hits" -ne 0 ]; then
  echo
  echo "!! Literal colour(s) found above. Use a design token (hsl(var(--x)) / a Tailwind token"
  echo "   class) instead, or annotate an intentional exception with '// theme-ok'."
  exit 1
fi
echo "OK — no literal colours in component TS/TSX."
