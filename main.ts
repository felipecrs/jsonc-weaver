import type {
  JsonArray as JsoncMorphArray,
  JsonObject as JsoncMorphObject,
  JsonValue,
  Node,
  ObjectProp,
} from "jsonc-morph";
import { parse } from "jsonc-morph";

export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

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
 *   // This is a comment
 *   "name": "old-name",
 *   "version": "1.0.0"
 * }
 * ```
 *
 * Usage:
 * ```typescript
 * const original = await readFile('original.jsonc');
 * const modified = { name: "new-name", version: "2.0.0" };
 * const result = weave(original, modified);
 * ```
 *
 * Result:
 * ```jsonc
 * {
 *   // This is a comment
 *   "name": "new-name",
 *   "version": "2.0.0"
 * }
 * ```
 */
export function weave(
  original: string,
  modified: JsonObject | JsonArray
): string {
  const root = parse(original, {
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

function updateObject(
  existingObject: JsoncMorphObject,
  newObject: object
): void {
  const existingProps = new Map(
    existingObject
      .properties()
      .map((prop) => [prop.nameOrThrow().decodedValue(), prop])
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

    // Property is new - check if it might be a rename
    let renamedFromProp = undefined;
    for (const [oldKey, oldProp] of existingProps) {
      if (
        propsToRemove.has(oldKey) &&
        !processedKeys.has(oldKey) &&
        oldProp.propertyIndex() === insertIndex
      ) {
        renamedFromProp = { key: oldKey, prop: oldProp };
        break;
      }
    }

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

function updateArray(
  existingArray: JsoncMorphArray,
  newValues: JsonValue[]
): void {
  const existingElements = existingArray.elements();
  const matched = new Array(existingElements.length).fill(false);
  const indicesToReplace: number[] = [];

  for (let i = 0; i < newValues.length; i++) {
    if (i >= existingElements.length) {
      existingArray.append(newValues[i]);
      continue;
    }

    const element = existingElements[i];

    if (
      !matched[i] &&
      (tryUpdateNestedValue(element, newValues[i]) ||
        areValuesEquivalent(element, newValues[i]))
    ) {
      matched[i] = true;
      continue;
    }

    let foundMatch = false;
    for (let j = i + 1; j < Math.min(i + 3, existingElements.length); j++) {
      if (
        !matched[j] &&
        areValuesEquivalent(existingElements[j], newValues[i])
      ) {
        matched[j] = true;
        tryUpdateNestedValue(existingElements[j], newValues[i]);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch && !matched[i]) {
      indicesToReplace.push(i);
      matched[i] = true;
    }
  }

  const hasSingleElement = existingElements.length === 1;
  for (let i = indicesToReplace.length - 1; i >= 0; i--) {
    const index = indicesToReplace[i];
    const insertedElement = existingArray.insert(index + 1, newValues[index]);
    if (hasSingleElement) {
      removePrecedingWhitespace(insertedElement);
    }
    removeNode(existingElements[index]);
  }

  for (let i = existingElements.length - 1; i >= 0; i--) {
    if (!matched[i]) {
      removeNode(existingElements[i]);
    }
  }
}

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

function removeNode(node: Node): void {
  if (node.isString()) {
    node.asStringLitOrThrow().remove();
    return;
  }

  if (node.isNumber()) {
    node.asNumberLitOrThrow().remove();
    return;
  }

  if (node.isBoolean()) {
    node.asBooleanLitOrThrow().remove();
    return;
  }

  if (node.isNull()) {
    node.asNullKeywordOrThrow().remove();
    return;
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

function removePrecedingWhitespace(node: Node): void {
  const previous = node.previousSibling();
  if (previous === undefined) {
    return;
  }

  if (
    previous.isWhitespace() ||
    previous.isNewline() ||
    previous.asStringLit()?.rawValue().trim() === ""
  ) {
    previous.remove();
    removePrecedingWhitespace(node);
  }
}
