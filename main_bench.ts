import { parse, weave } from "./main.ts";
import { parse as parseToAst } from "@david/jsonc-morph";
import { assertEquals } from "@std/assert";
import type { JsonArray, JsonObject } from "./main.ts";

Deno.bench({
  name: "JSON.parse()",
  group: "parse",
  n: 10_000,
  fn: async (b) => {
    const jsonc = await Deno.readTextFile("./fixtures/object/expected.jsonc");
    const parsed = parse(jsonc);
    const json = JSON.stringify(parsed);

    b.start();
    const result = JSON.parse(json);
    b.end();

    assertEquals(result, parsed);
  },
});

Deno.bench({
  name: "parse()",
  group: "parse",
  baseline: true,
  n: 10_000,
  fn: async (b) => {
    const jsonc = await Deno.readTextFile("./fixtures/object/expected.jsonc");
    const parsed = parse(jsonc);
    const json = JSON.stringify(parsed);

    b.start();
    // parse the plain json for a fair comparison
    const result = parse(json);
    b.end();

    assertEquals(result, parsed);
  },
});

Deno.bench({
  name: "parseToAst().toString() - object",
  group: "weave-object",
  n: 10_000,
  fn: async (b) => {
    const jsonc = await Deno.readTextFile("./fixtures/object/expected.jsonc");

    b.start();
    const result = parseToAst(jsonc).toString();
    b.end();

    assertEquals(result, jsonc);
  },
});

Deno.bench({
  name: "weave() - object",
  group: "weave-object",
  baseline: true,
  n: 10_000,
  fn: async (b) => {
    const original = await Deno.readTextFile(
      "./fixtures/object/original.jsonc"
    );
    const expected = await Deno.readTextFile(
      "./fixtures/object/expected.jsonc"
    );
    const modified = parse(expected) as JsonObject;

    b.start();
    const result = weave(original, modified);
    b.end();

    assertEquals(result, expected);
  },
});

Deno.bench({
  name: "parseToAst().toString() - array",
  group: "weave-array",
  n: 10_000,
  fn: async (b) => {
    const jsonc = await Deno.readTextFile("./fixtures/array/expected.jsonc");

    b.start();
    const result = parseToAst(jsonc).toString();
    b.end();

    assertEquals(result, jsonc);
  },
});

Deno.bench({
  name: "weave() - array",
  group: "weave-array",
  baseline: true,
  n: 10_000,
  fn: async (b) => {
    const original = await Deno.readTextFile("./fixtures/array/original.jsonc");
    const expected = await Deno.readTextFile("./fixtures/array/expected.jsonc");
    const modified = parse(expected) as JsonArray;

    b.start();
    const result = weave(original, modified);
    b.end();

    assertEquals(result, expected);
  },
});
