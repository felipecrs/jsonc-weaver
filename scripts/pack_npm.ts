/**
 * Build an npm package via `deno pack`, then adjust metadata for npm consumers.
 *
 * `deno pack` uses deno.json as the source of truth. We then:
 * - rename the package to the existing unscoped npm name
 * - map JSR deps onto their npm equivalents (and rewrite imports)
 * - add package.json fields that are not expressed in deno.json
 */
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import process from "node:process";
import { parse } from "../main.ts";

const version = process.argv[2];
const tarball = "npm.tgz";
const outDir = "npm";

/** Specifiers rewritten in emitted JS/d.ts and package.json dependencies. */
const importRewrites: Array<[from: string, to: string]> = [
  ["@david/jsonc-morph", "jsonc-morph"],
  ["@jsr/david__jsonc-morph", "jsonc-morph"],
];

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

await rm(outDir, { recursive: true, force: true });
await rm(tarball, { force: true });

const packArgs = ["pack", "--allow-dirty", "-o", tarball];
if (version) {
  packArgs.push("--set-version", version);
}
run("deno", packArgs);

await mkdir(outDir, { recursive: true });
run("tar", ["-xzf", tarball, "-C", outDir, "--strip-components=1"]);
await rm(tarball, { force: true });

const packageJsonPath = `${outDir}/package.json`;
const pkg = parse(await readFile(packageJsonPath, "utf8")) as Record<
  string,
  unknown
>;

// Preserve the existing npm package identity (JSR uses the scoped name in deno.json).
pkg.name = "jsonc-weaver";
pkg.description =
  "Modify JSONC files programmatically while preserving comments and formatting.";
pkg.author = "Felipe Santos @felipecrs";
pkg.repository = {
  type: "git",
  url: "git+https://github.com/felipecrs/jsonc-weaver.git",
};
pkg.bugs = {
  url: "https://github.com/felipecrs/jsonc-weaver/issues",
};
pkg.homepage = "https://github.com/felipecrs/jsonc-weaver#readme";

// Map JSR npm-bridge deps to real npm packages.
if (pkg.dependencies && typeof pkg.dependencies === "object") {
  const deps = pkg.dependencies as Record<string, string>;
  const next: Record<string, string> = {};
  for (const [name, range] of Object.entries(deps)) {
    const mapped = importRewrites.find(([from]) => from === name)?.[1] ?? name;
    next[mapped] = range;
  }
  pkg.dependencies = next;
}

await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");

// Rewrite import specifiers in emitted modules to match npm package names.
for (const entry of await readdir(outDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(js|mjs|cjs|d\.ts)$/.test(entry.name)) continue;

  const path = `${outDir}/${entry.name}`;
  let text = await readFile(path, "utf8");
  let changed = false;
  for (const [from, to] of importRewrites) {
    const next = text
      .replaceAll(`"${from}"`, `"${to}"`)
      .replaceAll(`'${from}'`, `'${to}'`);
    if (next !== text) {
      text = next;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(path, text);
  }
}

console.log(`npm package ready in ./${outDir}`);
