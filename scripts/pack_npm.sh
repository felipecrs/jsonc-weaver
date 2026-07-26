#!/usr/bin/env bash
# Build an npm package via `deno pack` and extract it to ./npm.
# Source tree is not modified. npm-only metadata is written into the archive.
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

# Unscoped npm name + fields deno pack does not synthesize from deno.json.
deno eval "
const path = 'npm/package.json';
const pkg = JSON.parse(await Deno.readTextFile(path));
pkg.name = 'jsonc-weaver';
pkg.description =
  'Modify JSONC files programmatically while preserving comments and formatting.';
pkg.author = 'Felipe Santos @felipecrs';
pkg.repository = {
  type: 'git',
  url: 'git+https://github.com/felipecrs/jsonc-weaver.git',
};
pkg.bugs = { url: 'https://github.com/felipecrs/jsonc-weaver/issues' };
pkg.homepage = 'https://github.com/felipecrs/jsonc-weaver#readme';
if (Deno.args[0]) pkg.version = Deno.args[0];
await Deno.writeTextFile(path, JSON.stringify(pkg, null, 2) + '\n');
" "$version"

echo "npm package ready in ./$outdir"
