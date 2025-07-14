import { Schema, Type } from '@google/genai';
import { describe, expect, it } from 'vitest';

import { sanitizeParametersForGemini } from './sanitize';

describe('sanitizeParametersForGemini', () => {
  it('should remove unsupported format from a simple string property', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        id: { type: Type.STRING, format: 'uuid' },
      },
    };
    sanitizeParametersForGemini(schema);
    expect(schema.properties?.['id']).toHaveProperty('format', undefined);
    expect(schema.properties?.['name']).not.toHaveProperty('format');
  });

  it('should NOT remove supported format values', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, format: 'date-time' },
        role: {
          type: Type.STRING,
          format: 'enum',
          enum: ['admin', 'user'],
        },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParametersForGemini(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('should handle nested objects recursively', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        user: {
          type: Type.OBJECT,
          properties: {
            email: { type: Type.STRING, format: 'email' },
          },
        },
      },
    };
    sanitizeParametersForGemini(schema);
    expect(schema.properties?.['user']?.properties?.['email']).toHaveProperty('format', undefined);
  });

  it('should handle arrays of objects', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              itemId: { type: Type.STRING, format: 'uuid' },
            },
          },
        },
      },
    };
    sanitizeParametersForGemini(schema);
    expect((schema.properties?.['items']?.items as Schema)?.properties?.['itemId']).toHaveProperty(
      'format',
      undefined,
    );
  });

  it('should handle schemas with no properties to sanitize', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.NUMBER },
        isActive: { type: Type.BOOLEAN },
      },
    };
    const originalSchema = JSON.parse(JSON.stringify(schema));
    sanitizeParametersForGemini(schema);
    expect(schema).toEqual(originalSchema);
  });

  it('should not crash on an empty or undefined schema', () => {
    expect(() => sanitizeParametersForGemini({})).not.toThrow();
    expect(() => sanitizeParametersForGemini(undefined)).not.toThrow();
  });

  it('should handle cyclic schemas without crashing', () => {
    const schema: any = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, format: 'hostname' },
      },
    };
    schema.properties.self = schema;

    expect(() => sanitizeParametersForGemini(schema)).not.toThrow();
    expect(schema.properties.name).toHaveProperty('format', undefined);
  });

  it('should handle complex nested schemas with cycles', () => {
    const userNode: any = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, format: 'uuid' },
        name: { type: Type.STRING },
        manager: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, format: 'uuid' },
          },
        },
      },
    };
    userNode.properties.reports = {
      type: Type.ARRAY,
      items: userNode,
    };

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        ceo: userNode,
      },
    };

    expect(() => sanitizeParametersForGemini(schema)).not.toThrow();
    expect(schema.properties?.['ceo']?.properties?.['id']).toHaveProperty('format', undefined);
    expect(schema.properties?.['ceo']?.properties?.['manager']?.properties?.['id']).toHaveProperty(
      'format',
      undefined,
    );
  });
});
