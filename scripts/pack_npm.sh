#!/usr/bin/env bash
# Build an npm package via `deno pack` and extract it to ./npm.
#
# deno.json keeps jsr:@david/jsonc-morph for Deno/JSR. For pack only, rewrite
# that import to npm:jsonc-morph so the archive depends on the npm package.
set -euo pipefail
cd "$(dirname "$0")/.."

tarball=npm.tgz
outdir=npm

original=$(cat deno.json)
restore() { printf '%s\n' "$original" >deno.json; }
trap restore EXIT

# jsr:@david/jsonc-morph@^x → npm:jsonc-morph@^x (version constraint kept)
if ! grep -q 'jsr:@david/jsonc-morph' deno.json; then
  echo "expected jsr:@david/jsonc-morph in deno.json" >&2
  exit 1
fi
printf '%s\n' "$original" |
  sed 's|jsr:@david/jsonc-morph|npm:jsonc-morph|g' >deno.json

rm -rf "$outdir" "$tarball"
pack_args=(pack --allow-dirty --ignore=deno.lock -o "$tarball")
for arg in "$@"; do
  [[ "$arg" == "--" ]] && continue
  pack_args+=(--set-version "$arg")
  break
done
deno "${pack_args[@]}"

mkdir "$outdir"
tar -xzf "$tarball" -C "$outdir" --strip-components=1
rm -f "$tarball"

echo "npm package ready in ./$outdir"
