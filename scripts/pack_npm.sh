#!/usr/bin/env bash
# Build an npm package via `deno pack` and extract it to ./npm.
#
# Runtime deps come from package.json (jsonc-morph), so imports stay bare
# "jsonc-morph" and the source tree is never modified. Pack synthesizes
# entrypoints/deps; we only merge a few package.json fields into the archive.
set -euo pipefail
cd "$(dirname "$0")/.."

tarball=npm.tgz
outdir=npm
version=

for arg in "$@"; do
  [[ "$arg" == "--" ]] && continue
  version=$arg
  break
done

rm -rf "$outdir" "$tarball"
pack_args=(pack --allow-dirty --ignore=deno.lock -o "$tarball")
[[ -n "$version" ]] && pack_args+=(--set-version "$version")
deno "${pack_args[@]}"

mkdir "$outdir"
tar -xzf "$tarball" -C "$outdir" --strip-components=1
rm -f "$tarball"

# Merge npm metadata from package.json that pack doesn't put in the archive.
deno eval "
const root = JSON.parse(await Deno.readTextFile('package.json'));
const path = 'npm/package.json';
const pkg = JSON.parse(await Deno.readTextFile(path));
for (const key of ['description', 'author', 'repository', 'bugs', 'homepage']) {
  if (root[key] != null) pkg[key] = root[key];
}
if (root.name) pkg.name = root.name;
if (Deno.args[0]) pkg.version = Deno.args[0];
await Deno.writeTextFile(path, JSON.stringify(pkg, null, 2) + '\n');
" "$version"

echo "npm package ready in ./$outdir"
