import { weave } from "./main.ts";
import { parse } from "@std/jsonc";
import { parse as parseJsoncMorph } from "jsonc-morph";
import { assertEquals } from "@std/assert";

Deno.bench("parse and export", async (b) => {
  const expected = await Deno.readTextFile("./fixtures/object/expected.jsonc");

  b.start();
  const parsed = parseJsoncMorph(expected);
  const result = parsed.toString();
  b.end();

  assertEquals(result, expected);
});

Deno.bench("object", async (b) => {
  const original = await Deno.readTextFile("./fixtures/object/original.jsonc");
  const expected = await Deno.readTextFile("./fixtures/object/expected.jsonc");
  const modified = parse(expected) as object;

  b.start();
  const result = weave(original, modified);
  b.end();

  assertEquals(result, expected);
});

Deno.bench("array", async (b) => {
  const original = await Deno.readTextFile("./fixtures/array/original.jsonc");
  const expected = await Deno.readTextFile("./fixtures/array/expected.jsonc");
  const modified = parse(expected) as unknown[];

  b.start();
  const result = weave(original, modified);
  b.end();

  assertEquals(result, expected);
});
