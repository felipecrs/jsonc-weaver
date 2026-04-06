import { codeBlock } from "@hexagon/proper-tags";
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { JsonArray, JsonObject } from "./main.ts";
import { parse, weave } from "./main.ts";

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

  it("renames a single property", () => {
    const original = codeBlock`
      {
        "oldName": "value"
      }
    `;
    const modified = { newName: "value" } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "newName": "value"
        }
      `,
    );
  });

  it("renames multiple properties in sequence", () => {
    const original = codeBlock`
      {
        "a": 1,
        "b": 2,
        "c": 3
      }
    `;
    const modified = { x: 1, y: 2, z: 3 } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "x": 1,
          "y": 2,
          "z": 3
        }
      `,
    );
  });

  it("renames a property with a changed value", () => {
    const original = codeBlock`
      {
        "oldKey": "oldValue"
      }
    `;
    const modified = { newKey: "newValue" } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "newKey": "newValue"
        }
      `,
    );
  });

  it("changes a value that contains escaped characters", () => {
    const original = codeBlock`
      {
        "key": "/^oldValue\\\\.txt$/"
      }
    `;
    const modified = { key: "/^newValue\\.txt$/" } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "key": "/^newValue\\\\.txt$/"
        }
      `,
    );
  });

  it("adds a new property to an object", () => {
    const original = codeBlock`
      {
        "existing": 1
      }
    `;
    const modified = { existing: 1, added: 2 } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "existing": 1,
          "added": 2
        }
      `,
    );
  });

  it("removes a property from an object", () => {
    const original = codeBlock`
      {
        "keep": 1,
        "remove": 2
      }
    `;
    const modified = { keep: 1 } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "keep": 1
        }
      `,
    );
  });

  it("replaces an array element that does not match", () => {
    const original = codeBlock`
      [
        "a",
        "b",
        "c"
      ]
    `;
    const modified = ["a", "x", "c"] as JsonArray;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        [
          "a",
          "x",
          "c"
        ]
      `,
    );
  });

  it("appends elements to an array", () => {
    const original = codeBlock`
      [
        "a"
      ]
    `;
    const modified = ["a", "b", "c"] as JsonArray;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        [
          "a",
          "b",
          "c"
        ]
      `,
    );
  });

  it("removes elements from an array", () => {
    const original = codeBlock`
      [
        "a",
        "b",
        "c"
      ]
    `;
    const modified = ["a"] as JsonArray;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        [
          "a"
        ]
      `,
    );
  });

  it("handles nested object updates", () => {
    const original = codeBlock`
      {
        "outer": {
          "inner": "old" // inner comment
        }
      }
    `;
    const modified = { outer: { inner: "new" } } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "outer": {
            "inner": "new" // inner comment
          }
        }
      `,
    );
  });

  it("handles nested array within object", () => {
    const original = codeBlock`
      {
        "items": [
          "one",
          "two"
        ]
      }
    `;
    const modified = { items: ["one", "three"] } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "items": [
            "one",
            "three"
          ]
        }
      `,
    );
  });

  it("replaces a single-element array value", () => {
    const original = codeBlock`
      [
        "old"
      ]
    `;
    const modified = ["new"] as JsonArray;
    const result = weave(original, modified);
    assertEquals(result,
      codeBlock`
        [
          "new"
        ]
      `);
  });

  it("handles all value types in an object", () => {
    const original = codeBlock`
      {
        "str": "hello",
        "num": 42,
        "bool": true,
        "nil": null
      }
    `;
    const modified = {
      str: "world",
      num: 100,
      bool: false,
      nil: null,
    } as JsonObject;
    const result = weave(original, modified);
    assertEquals(
      result,
      codeBlock`
        {
          "str": "world",
          "num": 100,
          "bool": false,
          "nil": null
        }
      `,
    );
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
