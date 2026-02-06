import { build } from "@deno/dnt";
import { copy, emptyDir } from "@std/fs";

async function replaceInFile(
  filePath: string,
  searchValue: string,
  replaceValue: string,
) {
  const text = await Deno.readTextFile(filePath);
  const updatedText = text.replaceAll(searchValue, replaceValue);
  await Deno.writeTextFile(filePath, updatedText);
}

async function appendLinesToFile(filePath: string, lines: string[]) {
  const content = await Deno.readTextFile(filePath);
  const updatedContent = content + "\n" + lines.join("\n") + "\n";
  await Deno.writeTextFile(filePath, updatedContent);
}

async function readJsonFile(filePath: string) {
  const text = await Deno.readTextFile(filePath);
  return JSON.parse(text);
}

await emptyDir("./npm");

// https://github.com/denoland/dnt/issues/437#issuecomment-3859954995
await replaceInFile("deno.json", "jsr:@david/jsonc-morph", "npm:jsonc-morph");

const { version } = await readJsonFile("deno.json");

await build({
  entryPoints: ["./main.ts"],
  outDir: "./npm",
  typeCheck: "both",
  scriptModule: false,
  skipSourceOutput: true,
  shims: {
    deno: "dev",
  },
  package: {
    name: "jsonc-weaver",
    version,
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
  // https://github.com/denoland/dnt/issues/422#issuecomment-2287108730
  compilerOptions: {
    lib: ["ESNext"],
  },
  async postBuild() {
    await replaceInFile(
      "deno.json",
      "npm:jsonc-morph",
      "jsr:@david/jsonc-morph",
    );

    await copy("README.md", "npm/README.md");
    await copy("LICENSE", "npm/LICENSE");
    await copy("fixtures", "npm/esm/fixtures");

    await appendLinesToFile("npm/.npmignore", ["/esm/fixtures/", "/esm/deps/"]);
  },
});
