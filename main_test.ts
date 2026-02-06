import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import { parse, weave } from "./main.ts";
import { codeBlock } from "@hexagon/proper-tags";
import type { JsonArray, JsonObject } from "./main.ts";

describe("weave()", () => {
  it("preserves comments and formatting for json object", async () => {
    const original = await Deno.readTextFile(
      import.meta.dirname + "/fixtures/object/original.jsonc",
    );
    const expected = await Deno.readTextFile(
      import.meta.dirname + "/fixtures/object/expected.jsonc",
    );
    const modified = parse(expected) as JsonObject;
    const result = weave(original, modified);
    assertEquals(result, expected);
  });

  it("preserves comments and formatting for json array", async () => {
    const original = await Deno.readTextFile(
      import.meta.dirname + "/fixtures/array/original.jsonc",
    );
    const expected = await Deno.readTextFile(
      import.meta.dirname + "/fixtures/array/expected.jsonc",
    );
    const modified = parse(expected) as JsonArray;
    const result = weave(original, modified);
    assertEquals(result, expected);
  });
});

describe("parse()", () => {
  it("allows comments", () => {
    const validJson = codeBlock`
      {
        // comments
        "name": "test"
      }
    `;
    const result = parse(validJson);
    assertEquals(result, { name: "test" });
  });

  it("allows trailing commas", () => {
    const validJson = codeBlock`
      {
        "trailingComma": "in objects",
        "andIn": ["arrays"],
      }
    `;
    const result = parse(validJson);
    assertEquals(result, {
      trailingComma: "in objects",
      andIn: ["arrays"],
    });
  });

  it("throws error when json has missing comma", () => {
    const invalidJson = codeBlock`
      {
        "name": "test"
        "version": "1.0.0"
      }
    `;
    assertThrows(() => parse(invalidJson), Error, "Expected comma");
  });

  it("throws error when json has hexadecimal numbers", () => {
    const invalidJson = codeBlock`
      {
        "value": 0xFF
      }
    `;
    assertThrows(
      () => parse(invalidJson),
      Error,
      "Hexadecimal numbers are not allowed",
    );
  });

  it("throws error when json has loose object property names", () => {
    const invalidJson = codeBlock`
      {
        name: "test"
      }
    `;
    assertThrows(
      () => parse(invalidJson),
      Error,
      "Expected string for object property",
    );
  });

  it("throws error when json has single quoted strings", () => {
    const invalidJson = codeBlock`
      {
        "name": 'test'
      }
    `;
    assertThrows(
      () => parse(invalidJson),
      Error,
      "Single-quoted strings are not allowed",
    );
  });

  it("throws error when json has unary plus numbers", () => {
    const invalidJson = codeBlock`
      {
        "value": +42
      }
    `;
    assertThrows(
      () => parse(invalidJson),
      Error,
      "Unary plus on numbers is not allowed",
    );
  });

  it("throws error when json has leading decimal point", () => {
    const invalidJson = codeBlock`
      {
        "leadingDecimalPoint": .8675309
      }
    `;
    assertThrows(() => parse(invalidJson), Error, "Unexpected token");
  });

  it("throws error when json has trailing decimal point", () => {
    const invalidJson = codeBlock`
      {
        "andTrailing": 8675309.
      }
    `;
    assertThrows(() => parse(invalidJson), Error, "Expected digit");
  });

  it("throws error when json has Infinity", () => {
    const invalidJson = codeBlock`
      {
        "infinity": Infinity
      }
    `;
    assertThrows(() => parse(invalidJson), Error, "Unexpected word");
  });

  it("throws error when json has NaN", () => {
    const invalidJson = codeBlock`
      {
        "notANumber": NaN
      }
    `;
    assertThrows(() => parse(invalidJson), Error, "Unexpected word");
  });
});
