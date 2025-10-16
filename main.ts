import type { JsonObject, JsonValue, Node, ObjectProp, RootNode } from "jsonc-morph";
import { parse } from "jsonc-morph";

/**
 * Updates a JSON object in place, preserving comments and formatting.
 * Handles nested objects and arrays recursively.
 */
function updateObject(targetObj: JsonObject, newObj: object): void {
  // Build a map of existing properties by name
  const existingProps = new Map(
    targetObj.properties().map((prop) => [prop.name()?.decodedValue(), prop])
  );

  // Track which existing properties we've already processed
  const processedKeys = new Set<string>();

  // Identify properties to be removed (exist in old but not in new)
  const propsToRemove = new Set<string>();
  for (const key of existingProps.keys()) {
    if (key === undefined) {
      continue;
    }
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
        if (oldKey === undefined) {
          continue;
        }
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
        // Rename: replace the old property with the new one in place
        renamedFromProp.prop.replaceWith(key, value);
        processedKeys.add(renamedFromProp.key);
        propsToRemove.delete(renamedFromProp.key);
        insertIndex = renamedFromProp.prop.propertyIndex() + 1;

        // Format arrays as multiline
        if (Array.isArray(value) && value.length > 0) {
          const renamedProp = targetObj.get(key);
          const arrayValue = renamedProp?.valueIfArray();
          arrayValue?.ensureMultiline();
        }
      } else {
        // New property: insert at current position
        const newProp = targetObj.insert(insertIndex, key, value);
        insertIndex++;

        // Format arrays as multiline
        if (Array.isArray(value) && value.length > 0) {
          newProp.valueIfArray()?.ensureMultiline();
        }
      }
    }
  }

  // Remove properties that no longer exist in the new object
  for (const [key, prop] of existingProps) {
    if (key === undefined) {
      continue;
    }
    if (propsToRemove.has(key)) {
      prop.remove();
    }
  }
}

/**
 * Updates a property value, recursively handling objects and arrays
 * to preserve comments.
 */
function updatePropertyValue(prop: ObjectProp, value: JsonValue): void {
  if (Array.isArray(value)) {
    updateArrayValue(prop, value);
  } else if (value !== null && typeof value === "object") {
    updateObjectValue(prop, value);
  } else {
    // For primitive values (string, number, boolean, null), just update
    prop.setValue(value);
  }
}

/**
 * Replaces a node with a new value. Handles all node types.
 */
function replaceNode(node: Node, newValue: JsonValue): void {
  if (node.isString()) {
    node.asStringLit()?.replaceWith(newValue);
  } else if (node.isNumber()) {
    node.asNumberLit()?.replaceWith(newValue);
  } else if (node.isBoolean()) {
    node.asBooleanLit()?.replaceWith(newValue);
  } else if (node.isNull()) {
    node.asNullKeyword()?.replaceWith(newValue);
  } else if (node.isContainer()) {
    const asArray = node.asArray();
    if (asArray) {
      asArray.replaceWith(newValue);
    } else {
      node.asObject()?.replaceWith(newValue);
    }
  }
}

/**
 * Removes a node from its parent. Handles all node types.
 */
function removeNode(node: Node): void {
  if (node.isString()) {
    node.asStringLit()?.remove();
  } else if (node.isNumber()) {
    node.asNumberLit()?.remove();
  } else if (node.isBoolean()) {
    node.asBooleanLit()?.remove();
  } else if (node.isNull()) {
    node.asNullKeyword()?.remove();
  } else if (node.isContainer()) {
    const asArray = node.asArray();
    if (asArray) {
      asArray.remove();
    } else {
      node.asObject()?.remove();
    }
  }
}

/**
 * Updates an array property value, preserving comments on elements.
 */
function updateArrayValue(prop: ObjectProp, value: JsonValue[]): void {
  const existingArray = prop.valueIfArray();
  if (existingArray) {
    const existingElements = existingArray.elements();

    // Remove excess elements from the end first to avoid index issues
    for (let i = existingElements.length - 1; i >= value.length; i--) {
      removeNode(existingElements[i]);
    }

    // Update or insert elements
    for (let i = 0; i < value.length; i++) {
      if (i < existingElements.length) {
        replaceNode(existingElements[i], value[i]);
      } else {
        existingArray.append(value[i]);
      }
    }
  } else {
    // Not an array currently, replace with array and format as multiline
    prop.setValue(value);
    if (value.length > 0) {
      const newArray = prop.valueIfArray();
      if (newArray) {
        newArray.ensureMultiline();
      }
    }
  }
}

/**
 * Updates an object property value, recursively preserving comments.
 */
function updateObjectValue(prop: ObjectProp, value: Record<string, JsonValue>): void {
  const existingObj = prop.valueIfObject();
  if (existingObj) {
    // Object exists - recursively update it
    updateObject(existingObj, value);
  } else {
    // Not an object currently - replace with the new object value
    prop.setValue(value);
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
