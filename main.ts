import type {
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
      .map((prop) => [prop.nameOrThrow().decodedValue(), prop]),
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

function updateArray(
  existingArray: NonNullable<ReturnType<Node["asArray"]>>,
  value: JsonValue[],
): void {
  const existingElements = existingArray.elements();

  // Remove excess elements from the end first to avoid index issues
  for (let i = existingElements.length - 1; i >= value.length; i--) {
    removeNode(existingElements[i]);
  }

  // Update or insert elements
  const indicesToReplace: number[] = [];

  for (let i = 0; i < value.length; i++) {
    const newValue = value[i];

    if (i < existingElements.length) {
      const existingElement = existingElements[i];

      // Handle nested objects - recursively update them
      if (newValue !== null && typeof newValue === "object" && !Array.isArray(newValue)) {
        const existingObj = existingElement.asObject();
        if (existingObj) {
          updateObject(existingObj, newValue);
          continue;
        }
      }

      // Handle nested arrays - recursively update them
      if (Array.isArray(newValue)) {
        const existingArr = existingElement.asArray();
        if (existingArr) {
          updateArray(existingArr, newValue);
          continue;
        }
      }

      if (shouldPreserveComments(existingElement, newValue)) {
        // Value hasn't changed - skip update to preserve original formatting
        continue;
      } else {
        // Value changed or type changed - mark for replacement
        indicesToReplace.push(i);
      }
    } else {
      existingArray.append(newValue);
    }
  }

  // Now handle replacements in reverse order to avoid index issues
  const singleElement = existingArray.elements().length === 1;
  for (let i = indicesToReplace.length - 1; i >= 0; i--) {
    const index = indicesToReplace[i];
    const existingElement = existingElements[index];
    const inserted = existingArray.insert(index + 1, value[index]);

    if (singleElement) {
      removePreviousWhitespaces(inserted);
    }

    removeNode(existingElement);
  }
}

function removePreviousWhitespaces(node: Node): void {
  const previous = node.previousSibling();
  if (previous === undefined) {
    return;
  }

  if (previous.isWhitespace() || previous.isNewline() || previous.asStringLit()?.rawValue().trim() === "") {
    previous.remove();
    removePreviousWhitespaces(node);
  }
}

/**
 * Weaves changes from a modified object back into the original JSONC string,
 * preserving comments, formatting, and structure.
 *
 * @param original - The original JSONC string
 * @param modified - The modified object containing the desired changes
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
export function weave(original: string, modified: object): string {
  const root: RootNode = parse(original, {
    allowComments: true,
    allowTrailingCommas: true,
  });
  const rootObj: JsonObject = root.asObjectOrThrow();

  // Update the root object recursively to match the new structure
  updateObject(rootObj, modified);

  const result = root.toString();
  return result;
}
