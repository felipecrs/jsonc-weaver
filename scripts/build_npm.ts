import { build } from "@deno/dnt";
import { copy, emptyDir } from "@std/fs";

async function appendLinesToFile(filePath: string, lines: string[]) {
  const newContent = "\n" + lines.join("\n") + "\n";
  await Deno.writeTextFile(filePath, newContent, { append: true });
}

await emptyDir("./npm");

await build({
  entryPoints: ["./main.ts"],
  outDir: "./npm",
  typeCheck: "both",
  scriptModule: false,
  skipSourceOutput: true,
  shims: {
    deno: "dev",
  },
  mappings: {
    "jsr:@david/jsonc-morph": {
      name: "jsonc-morph",
    },
  },
  package: {
    name: "jsonc-weaver",
    version: "0.0.0-semantic-release",
    description:
      "Modify JSONC files programmatically while preserving comments and formatting.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/felipecrs/jsonc-weaver.git",
    },
    bugs: {
      url: "https://github.com/felipecrs/jsonc-weaver/issues",
    },
  },
  // https://github.com/denoland/dnt/issues/312#issuecomment-1573821661
  filterDiagnostic(diagnostic) {
    if (
      diagnostic.file?.fileName.endsWith("assertion_state.ts") &&
      diagnostic.code === 7017
    ) {
      return false;
    }
    return true;
  },
  // https://github.com/denoland/dnt/issues/422#issuecomment-2288311193
  compilerOptions: {
    lib: ["ESNext"],
  },
  async postBuild() {
    await copy("README.md", "npm/README.md");
    await copy("LICENSE", "npm/LICENSE");
    await copy("fixtures", "npm/esm/fixtures");

    await appendLinesToFile("npm/.npmignore", [
      "/esm/fixtures/",
      // https://github.com/denoland/dnt/issues/486#issuecomment-5125483729
      "/esm/deps/",
    ]);
  },
});
