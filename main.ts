import type {
  JsonArray,
  JsonObject,
  JsonValue,
  Node,
  ObjectProp,
  RootNode,
} from "jsonc-morph";
import { parse } from "jsonc-morph";

function updateObject(targetObj: JsonObject, newObj: object): void {
  // Build a map of existing properties by name
  const existingProps = new Map(
    targetObj
      .properties()
      .map((prop) => [prop.nameOrThrow().decodedValue(), prop])
  );

  // Track which existing properties we've already processed
  const processedKeys = new Set<string>();

  // Identify properties to be removed (exist in old but not in new)
  const propsToRemove = new Set<string>();
  for (const key of existingProps.keys()) {
    if (!(key in newObj)) {
      propsToRemove.add(key);
    }
  }

  let insertIndex = 0;

  // Process each property in the new object
  for (const [key, value] of Object.entries(newObj)) {
    processedKeys.add(key);
    const existingProp = existingProps.get(key);

    if (existingProp) {
      // Property exists - update its value in place
      updatePropertyValue(existingProp, value);
      insertIndex = existingProp.propertyIndex() + 1;
    } else {
      // Property is new - check if it might be a rename
      let renamedFromProp = null;
      for (const [oldKey, oldProp] of existingProps) {
        if (
          propsToRemove.has(oldKey) &&
          !processedKeys.has(oldKey) &&
          oldProp.propertyIndex() === insertIndex
        ) {
          // Found a property at the same position being removed - treat as rename
          renamedFromProp = { key: oldKey, prop: oldProp };
          break;
        }
      }

      if (renamedFromProp) {
        // Rename: remove the old property and insert new one without comments
        const oldIndex = renamedFromProp.prop.propertyIndex();
        renamedFromProp.prop.remove();
        const newProp = targetObj.insert(oldIndex, key, value);
        processedKeys.add(renamedFromProp.key);
        propsToRemove.delete(renamedFromProp.key);
        insertIndex = oldIndex + 1;

        // Format new array as multiline
        if (Array.isArray(value) && value.length > 0) {
          newProp.valueIfArrayOrThrow().ensureMultiline();
        }
      } else {
        // New property: insert at current position
        const newProp = targetObj.insert(insertIndex, key, value);
        insertIndex++;

        // Format new array as multiline
        if (Array.isArray(value) && value.length > 0) {
          newProp.valueIfArrayOrThrow().ensureMultiline();
        }
      }
    }
  }

  // Remove properties that no longer exist in the new object
  for (const [key, prop] of existingProps) {
    if (propsToRemove.has(key)) {
      prop.remove();
    }
  }
}

function updatePropertyValue(prop: ObjectProp, value: JsonValue): void {
  if (Array.isArray(value)) {
    const existingArray = prop.valueIfArray();
    if (existingArray) {
      updateArray(existingArray, value);
    } else {
      // Not an array currently, replace with array and format as multiline
      prop.setValue(value);
      if (value.length > 0) {
        prop.valueIfArrayOrThrow().ensureMultiline();
      }
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    const existingObj = prop.valueIfObject();
    if (existingObj) {
      updateObject(existingObj, value);
    } else {
      // Not an object currently - replace with the new object value
      prop.setValue(value);
    }
    return;
  }

  // For primitive values (string, number, boolean, null), just update
  prop.setValue(value);
}

function shouldPreserveComments(node: Node, newValue: JsonValue): boolean {
  if (typeof newValue === "string" && node.isString()) {
    return newValue === node.asStringLitOrThrow().decodedValue();
  }
  if (typeof newValue === "number" && node.isNumber()) {
    return newValue === Number(node.asNumberLitOrThrow().value());
  }
  if (typeof newValue === "boolean" && node.isBoolean()) {
    return newValue === node.asBooleanLitOrThrow().value();
  }
  if (newValue === null && node.isNull()) return true;
  if (Array.isArray(newValue) && node.asArray()) return true;
  if (typeof newValue === "object" && node.asObject()) return true;

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
    const asArray = node.asArray();
    if (asArray) {
      asArray.remove();
      return;
    }

    const asObject = node.asObjectOrThrow();
    asObject.remove();
    return;
  }

  throw new Error("Unsupported node type for removal");
}

function updateArray(existingArray: JsonArray, value: JsonValue[]): void {
  const existingElements = existingArray.elements();
  const matched = new Array(existingElements.length).fill(false);
  const toReplace: number[] = [];

  // Match each new value with existing elements
  for (let i = 0; i < value.length; i++) {
    if (i >= existingElements.length) {
      existingArray.append(value[i]);
      continue;
    }

    const elem = existingElements[i];

    // Check if current position matches (update nested or preserve)
    if (
      !matched[i] &&
      (updateNested(elem, value[i]) || shouldPreserveComments(elem, value[i]))
    ) {
      matched[i] = true;
      continue;
    }

    // Look ahead for a match (max 2 positions)
    let foundMatch = false;
    for (let j = i + 1; j < Math.min(i + 3, existingElements.length); j++) {
      if (
        !matched[j] &&
        shouldPreserveComments(existingElements[j], value[i])
      ) {
        matched[j] = true;
        updateNested(existingElements[j], value[i]);
        foundMatch = true;
        break;
      }
    }

    // No match found - replace current position
    if (!foundMatch && !matched[i]) {
      toReplace.push(i);
      matched[i] = true;
    }
  }

  // Apply changes in reverse order to maintain indices
  const singleElement = existingElements.length === 1;
  for (let i = toReplace.length - 1; i >= 0; i--) {
    const idx = toReplace[i];
    const inserted = existingArray.insert(idx + 1, value[idx]);
    if (singleElement) removePreviousWhitespaces(inserted);
    removeNode(existingElements[idx]);
  }

  // Remove unmatched elements (includes excess elements)
  for (let i = existingElements.length - 1; i >= 0; i--) {
    if (!matched[i]) removeNode(existingElements[i]);
  }
}

function updateNested(element: Node, value: JsonValue): boolean {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = element.asObject();
    if (obj) {
      updateObject(obj, value);
      return true;
    }
  }
  if (Array.isArray(value)) {
    const arr = element.asArray();
    if (arr) {
      updateArray(arr, value);
      return true;
    }
  }
  return false;
}

function removePreviousWhitespaces(node: Node): void {
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
    removePreviousWhitespaces(node);
  }
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
  modified: object | JsonValue[]
): string {
  const root: RootNode = parse(original, {
    allowComments: true,
    allowTrailingCommas: true,
  });

  if (Array.isArray(modified)) {
    // Handle array as root
    const rootArray = root.asArrayOrThrow();
    updateArray(rootArray, modified);
  } else {
    // Handle object as root
    const rootObj = root.asObjectOrThrow();
    updateObject(rootObj, modified);
  }

  const result = root.toString();
  return result;
}
