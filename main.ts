import type {
  JsonArray as JsoncMorphArray,
  JsonObject as JsoncMorphObject,
  JsonValue,
  Node,
  ObjectProp,
} from "@david/jsonc-morph";
import { parse as parseToAst, parseToValueStrict } from "@david/jsonc-morph";

export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Parses a JSONC string into a JavaScript value.
 *
 * @param text - The JSONC string to parse
 * @returns The parsed JavaScript value
 * @throws {Error} If the JSONC string is syntactically invalid (e.g., missing commas,
 *   hexadecimal numbers, loose property names, single-quoted strings)
 */
export function parse(text: string): JsonValue {
  return parseToValueStrict(text, {
    allowComments: true,
    allowTrailingCommas: true,
  });
}

/**
 * Weaves changes from a modified object or array back into the original JSONC string,
 * preserving comments, formatting, and structure.
 *
 * @param original - The original JSONC string
 * @param modified - The modified object or array containing the desired changes
 * @returns The updated JSONC string with changes applied and formatting preserved
 *
 * @example
 * Original JSONC:
 * ```jsonc
 * {
 *   "name": "old-name", // a comment
 *   "version": "1.0.0"
 * }
 * ```
 *
 * Usage:
 * ```typescript
 * const original = await readFile('original.jsonc');
 * const modified = JSONC.parse(original);
 * modified.name = "new-name";
 * modified.version = "2.0.0";
 * const result = weave(original, modified);
 * ```
 *
 * Result:
 * ```jsonc
 * {
 *   "name": "new-name", // a comment
 *   "version": "2.0.0"
 * }
 * ```
 *
 * @throws {Error} If `original` is not valid JSONC or if `modified` has a structure
 *   that cannot be reconciled with the original AST (e.g., root type mismatch)
 */
export function weave(
  original: string,
  modified: JsonObject | JsonArray,
): string {
  const root = parseToAst(original, {
    allowComments: true,
    allowTrailingCommas: true,
  });

  if (Array.isArray(modified)) {
    const rootArray = root.asArrayOrThrow();
    updateArray(rootArray, modified);
  } else {
    const rootObject = root.asObjectOrThrow();
    updateObject(rootObject, modified);
  }

  return root.toString();
}

/**
 * Detects if a new property key is a rename of an existing property scheduled for removal.
 * Returns the old key/prop pair if found at the expected insertion position, or undefined.
 */
function detectRename(
  existingProps: Map<string, ObjectProp>,
  propsToRemove: Set<string>,
  processedKeys: Set<string>,
  insertIndex: number,
): { key: string; prop: ObjectProp } | undefined {
  for (const [oldKey, oldProp] of existingProps) {
    if (
      propsToRemove.has(oldKey) &&
      !processedKeys.has(oldKey) &&
      oldProp.propertyIndex() === insertIndex
    ) {
      return { key: oldKey, prop: oldProp };
    }
  }
  return undefined;
}

function updateObject(
  existingObject: JsoncMorphObject,
  newObject: JsonObject,
): void {
  const existingProps = new Map(
    existingObject
      .properties()
      .map((prop) => [prop.nameOrThrow().decodedValue(), prop]),
  );

  const processedKeys = new Set<string>();
  const propsToRemove = new Set<string>();

  for (const key of existingProps.keys()) {
    if (!(key in newObject)) {
      propsToRemove.add(key);
    }
  }

  let insertIndex = 0;

  for (const [key, value] of Object.entries(newObject)) {
    processedKeys.add(key);
    const existingProp = existingProps.get(key);

    if (existingProp) {
      updatePropertyValue(existingProp, value);
      insertIndex = existingProp.propertyIndex() + 1;
      continue;
    }

    const renamedFromProp = detectRename(
      existingProps,
      propsToRemove,
      processedKeys,
      insertIndex,
    );

    if (renamedFromProp) {
      const oldIndex = renamedFromProp.prop.propertyIndex();
      const newProp = existingObject.insert(oldIndex + 1, key, value);
      renamedFromProp.prop.remove();
      processedKeys.add(renamedFromProp.key);
      propsToRemove.delete(renamedFromProp.key);
      insertIndex = oldIndex + 1;

      if (Array.isArray(value) && value.length > 0) {
        newProp.valueIfArrayOrThrow().ensureMultiline();
      }
    } else {
      const newProp = existingObject.insert(insertIndex, key, value);
      insertIndex++;

      if (Array.isArray(value) && value.length > 0) {
        newProp.valueIfArrayOrThrow().ensureMultiline();
      }
    }
  }

  for (const [key, prop] of existingProps) {
    if (propsToRemove.has(key)) {
      prop.remove();
    }
  }
}

/**
 * Phase 1: Match existing elements against new values and identify replacements.
 * Returns the matched flags and indices that need replacement.
 */
function matchElements(
  existingElements: Node[],
  newValues: JsonValue[],
): { matched: boolean[]; indicesToReplace: number[] } {
  const matched = new Array(existingElements.length).fill(false);
  const indicesToReplace: number[] = [];

  for (
    let i = 0;
    i < Math.min(newValues.length, existingElements.length);
    i++
  ) {
    const element = existingElements[i];

    if (
      !matched[i] &&
      (tryUpdateNestedValue(element, newValues[i]) ||
        areValuesEquivalent(element, newValues[i]))
    ) {
      matched[i] = true;
      continue;
    }

    const matchIndex = findEquivalentElement(
      existingElements,
      matched,
      i + 1,
      Math.min(i + 3, existingElements.length),
      newValues[i],
    );
    const foundMatch = matchIndex !== -1;
    if (foundMatch) {
      matched[matchIndex] = true;
      tryUpdateNestedValue(existingElements[matchIndex], newValues[i]);
    }

    if (!foundMatch && !matched[i]) {
      indicesToReplace.push(i);
      matched[i] = true;
    }
  }

  return { matched, indicesToReplace };
}

/** Phase 2: Append new values that extend beyond the existing array length. */
function appendNewElements(
  existingArray: JsoncMorphArray,
  existingLength: number,
  newValues: JsonValue[],
): void {
  for (let i = existingLength; i < newValues.length; i++) {
    existingArray.append(newValues[i]);
  }
}

/** Phase 3: Replace unmatched elements at queued indices with new values. */
function executeReplacements(
  existingArray: JsoncMorphArray,
  existingElements: Node[],
  newValues: JsonValue[],
  indicesToReplace: number[],
): void {
  for (let i = indicesToReplace.length - 1; i >= 0; i--) {
    const index = indicesToReplace[i];
    const insertedElement = existingArray.insert(index + 1, newValues[index]);
    if (!hasPrecedingNewline(existingElements[index])) {
      removePrecedingWhitespace(insertedElement);
    }
    removeNode(existingElements[index]);
  }
}

/** Phase 4: Remove remaining unmatched elements from the array. */
function removeUnmatchedElements(
  existingElements: Node[],
  matched: boolean[],
): void {
  for (let i = existingElements.length - 1; i >= 0; i--) {
    if (!matched[i]) {
      removeNode(existingElements[i]);
    }
  }
}

/** Mutates existingArray in-place, syncing its elements with newValues. */
function updateArray(
  existingArray: JsoncMorphArray,
  newValues: JsonValue[],
): void {
  const existingElements = existingArray.elements();

  const { matched, indicesToReplace } = matchElements(
    existingElements,
    newValues,
  );
  appendNewElements(existingArray, existingElements.length, newValues);
  executeReplacements(
    existingArray,
    existingElements,
    newValues,
    indicesToReplace,
  );
  removeUnmatchedElements(existingElements, matched);
}

/** Updates a single property's value, recursing into nested objects/arrays. */
function updatePropertyValue(property: ObjectProp, newValue: JsonValue): void {
  if (Array.isArray(newValue)) {
    const existingArray = property.valueIfArray();
    if (existingArray) {
      updateArray(existingArray, newValue);
      return;
    }

    property.setValue(newValue);
    if (newValue.length > 0) {
      property.valueIfArrayOrThrow().ensureMultiline();
    }
    return;
  }

  if (newValue !== null && typeof newValue === "object") {
    const existingObject = property.valueIfObject();
    if (existingObject) {
      updateObject(existingObject, newValue);
      return;
    }

    property.setValue(newValue);
    return;
  }

  property.setValue(newValue);
}

/** Attempts to update element as a nested object or array. Returns true if updated. */
function tryUpdateNestedValue(element: Node, newValue: JsonValue): boolean {
  if (
    newValue !== null &&
    typeof newValue === "object" &&
    !Array.isArray(newValue)
  ) {
    const object = element.asObject();
    if (object) {
      updateObject(object, newValue);
      return true;
    }
  }

  if (Array.isArray(newValue)) {
    const array = element.asArray();
    if (array) {
      updateArray(array, newValue);
      return true;
    }
  }

  return false;
}

/** Checks whether an AST node represents the same value type and content as newValue. */
function areValuesEquivalent(node: Node, newValue: JsonValue): boolean {
  if (typeof newValue === "string" && node.isString()) {
    return newValue === node.asStringLitOrThrow().decodedValue();
  }

  if (typeof newValue === "number" && node.isNumber()) {
    return newValue === Number(node.asNumberLitOrThrow().value());
  }

  if (typeof newValue === "boolean" && node.isBoolean()) {
    return newValue === node.asBooleanLitOrThrow().value();
  }

  if (newValue === null && node.isNull()) {
    return true;
  }

  if (Array.isArray(newValue) && node.asArray()) {
    return true;
  }

  if (typeof newValue === "object" && node.asObject()) {
    return true;
  }

  return false;
}

/** Removes a node from the AST by dispatching to the appropriate typed removal method. */
function removeNode(node: Node): void {
  const removers: Array<[() => boolean, () => void]> = [
    [() => node.isString(), () => node.asStringLitOrThrow().remove()],
    [() => node.isNumber(), () => node.asNumberLitOrThrow().remove()],
    [() => node.isBoolean(), () => node.asBooleanLitOrThrow().remove()],
    [() => node.isNull(), () => node.asNullKeywordOrThrow().remove()],
  ];

  for (const [check, remove] of removers) {
    if (check()) {
      remove();
      return;
    }
  }

  if (node.isContainer()) {
    const array = node.asArray();
    if (array) {
      array.remove();
      return;
    }
    node.asObjectOrThrow().remove();
    return;
  }

  throw new Error("Unsupported node type for removal");
}

/** Searches elements[startIndex..endIndex) for an unmatched node equivalent to value. Returns index or -1. */
function findEquivalentElement(
  elements: Node[],
  matched: boolean[],
  startIndex: number,
  endIndex: number,
  value: JsonValue,
): number {
  for (let j = startIndex; j < endIndex; j++) {
    if (!matched[j] && areValuesEquivalent(elements[j], value)) {
      return j;
    }
  }
  return -1;
}

/** Checks if any preceding sibling (skipping whitespace) is a newline. */
function hasPrecedingNewline(node: Node): boolean {
  let prev = node.previousSibling();
  while (prev !== undefined) {
    if (prev.isNewline()) return true;
    if (!prev.isWhitespace()) return false;
    prev = prev.previousSibling();
  }
  return false;
}

/** Iteratively removes whitespace and newline siblings preceding node. */
function removePrecedingWhitespace(node: Node): void {
  let previous = node.previousSibling();
  while (
    previous !== undefined &&
    (previous.isWhitespace() ||
      previous.isNewline() ||
      previous.asStringLit()?.rawValue().trim() === "")
  ) {
    previous.remove();
    previous = node.previousSibling();
  }
}
