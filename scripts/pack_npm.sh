#!/usr/bin/env bash
# Build an npm package via `deno pack` and extract it to ./npm.
set -euo pipefail
cd "$(dirname "$0")/.."

tarball=npm.tgz
outdir=npm

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
