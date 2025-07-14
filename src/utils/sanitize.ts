import { Schema, Type } from '@google/genai';

/**
 * Sanitizes a schema object in-place to ensure compatibility with the Gemini API.
 *
 * NOTE: This function mutates the passed schema object.
 *
 * It performs the following actions:
 * - Removes the `default` property when `anyOf` is present.
 * - Removes unsupported `format` values from string properties, keeping only 'enum' and 'date-time'.
 * - Recursively sanitizes nested schemas within `anyOf`, `items`, and `properties`.
 * - Handles circular references within the schema to prevent infinite loops.
 *
 * @param schema The schema object to sanitize. It will be modified directly.
 * @param visited A set used internally to track visited schema objects during recursion.
 */
export function sanitizeParametersForGemini(schema?: Schema, visited = new Set<Schema>()) {
  if (!schema || visited.has(schema)) {
    return;
  }
  visited.add(schema);

  if (schema.anyOf) {
    // Vertex AI gets confused if both anyOf and default are set.
    schema.default = undefined;
    for (const item of schema.anyOf) {
      if (typeof item !== 'boolean') {
        sanitizeParametersForGemini(item, visited);
      }
    }
  }
  if (schema.items && typeof schema.items !== 'boolean') {
    sanitizeParametersForGemini(schema.items, visited);
  }
  if (schema.properties) {
    for (const item of Object.values(schema.properties)) {
      if (typeof item !== 'boolean') {
        sanitizeParametersForGemini(item, visited);
      }
    }
  }
  // Vertex AI only supports 'enum' and 'date-time' for STRING format.
  if (schema.type === Type.STRING) {
    if (!(schema.format && schema.format !== 'enum' && schema.format !== 'date-time')) return;
    schema.format = undefined;
  }
}
