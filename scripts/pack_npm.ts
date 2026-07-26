/**
 * Build an npm package via `deno pack`.
 *
 * Before packing, rewrite JSR dual-published deps to their npm equivalents so
 * `deno pack` emits correct bare imports and package.json dependencies — no
 * post-processing of the packed files is required for that.
 */
import { parse } from "../main.ts";

const version = Deno.args[0];
const tarball = "npm.tgz";
const outDir = "npm";
const denoJsonPath = "deno.json";

/** JSR → npm dual-publish rewrites applied only while packing. */
const importReplacements: Array<{ fromPrefix: string; toPrefix: string }> = [
  { fromPrefix: "jsr:@david/jsonc-morph", toPrefix: "npm:jsonc-morph" },
];

async function rm(path: string, recursive = false) {
  try {
    await Deno.remove(path, { recursive });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

async function run(command: string, args: string[]) {
  const result = await new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.code}`,
    );
  }
}

const originalDenoJson = await Deno.readTextFile(denoJsonPath);
const config = parse(originalDenoJson) as {
  imports?: Record<string, string>;
  [key: string]: unknown;
};

if (!config.imports) {
  throw new Error(`${denoJsonPath} has no imports map`);
}

let replaced = 0;
for (const [key, value] of Object.entries(config.imports)) {
  for (const { fromPrefix, toPrefix } of importReplacements) {
    if (value === fromPrefix || value.startsWith(`${fromPrefix}@`)) {
      config.imports[key] = toPrefix + value.slice(fromPrefix.length);
      replaced++;
    }
  }
}
if (replaced === 0) {
  throw new Error(
    `No import replacements matched in ${denoJsonPath}; update importReplacements`,
  );
}

// Dual-published npm packages may be newer on npm than Deno's default
// minimum dependency age allows, even when the JSR copy is already usable.
config.minimumDependencyAge = 0;

await rm(outDir, true);
await rm(tarball);

try {
  await Deno.writeTextFile(
    denoJsonPath,
    JSON.stringify(config, null, 2) + "\n",
  );

  const packArgs = ["pack", "--allow-dirty", "-o", tarball];
  if (version) {
    packArgs.push("--set-version", version);
  }
  await run("deno", packArgs);

  await Deno.mkdir(outDir, { recursive: true });
  await run("tar", ["-xzf", tarball, "-C", outDir, "--strip-components=1"]);
  await rm(tarball);
} finally {
  await Deno.writeTextFile(denoJsonPath, originalDenoJson);
}

console.log(`npm package ready in ./${outDir}`);
