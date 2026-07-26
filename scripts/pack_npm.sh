#!/usr/bin/env bash
# Build an npm package via `deno pack`.
# Temporarily rewrite dual-published JSR deps to npm so pack emits correct deps.
set -euo pipefail
cd "$(dirname "$0")/.."

tarball=npm.tgz
outdir=npm

original=$(cat deno.json)
restore() { printf '%s\n' "$original" >deno.json; }
trap restore EXIT

# jsr:@david/jsonc-morph@^x → npm:jsonc-morph@^x
# minimumDependencyAge: 0 so a just-published npm twin of a JSR dep can resolve
printf '%s\n' "$original" |
  sed 's|jsr:@david/jsonc-morph|npm:jsonc-morph|g' |
  awk 'NR==1{print; print "  \"minimumDependencyAge\": 0,"; next}1' >deno.json

rm -rf "$outdir" "$tarball"
pack_args=(pack --allow-dirty -o "$tarball")
[[ $# -gt 0 ]] && pack_args+=(--set-version "$1")
deno "${pack_args[@]}"

mkdir "$outdir"
tar -xzf "$tarball" -C "$outdir" --strip-components=1
rm -f "$tarball"

echo "npm package ready in ./$outdir"
