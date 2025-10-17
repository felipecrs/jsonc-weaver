import {
  describe,
  it,
} from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { weave } from "./main.ts";

describe("weave", () => {
  it("preserves comments and formatting for json object", async () => {
    const original = await Deno.readTextFile("./fixtures/object/original.jsonc");
    const modified = JSON.parse(await Deno.readTextFile("./fixtures/object/modified.json"));
    const expected = await Deno.readTextFile("./fixtures/object/expected.jsonc");
    const result = weave(original, modified);
    assertEquals(result, expected);
  });

  it("preserves comments and formatting for json array", async () => {
    const original = await Deno.readTextFile("./fixtures/array/original.jsonc");
    const modified = JSON.parse(await Deno.readTextFile("./fixtures/array/modified.json"));
    const expected = await Deno.readTextFile("./fixtures/array/expected.jsonc");
    const result = weave(original, modified);
    assertEquals(result, expected);
  });
});
