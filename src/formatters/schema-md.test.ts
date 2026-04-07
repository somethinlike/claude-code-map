import { describe, it, expect } from 'vitest';
import { formatSchema } from './schema-md.ts';
import type { ExtractedModel, SchemaField } from '../types.ts';

function makeField(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'id',
    type: 'Int',
    required: true,
    isRelation: false,
    attributes: [],
    ...overrides,
  };
}

function makeModel(overrides: Partial<ExtractedModel> = {}): ExtractedModel {
  return {
    name: 'User',
    fields: [
      makeField({ name: 'id', type: 'Int', attributes: ['PK'] }),
      makeField({ name: 'email', type: 'String' }),
    ],
    filePath: 'prisma/schema.prisma',
    orm: 'prisma',
    ...overrides,
  };
}

describe('formatSchema', () => {
  it('returns null for empty models', () => {
    const result = formatSchema([]);
    expect(result).toBeNull();
  });

  it('ORM name appears in header', () => {
    const result = formatSchema([makeModel({ orm: 'drizzle' })]);
    expect(result).toContain('**ORM:** drizzle');
  });

  it('simple model (3 or fewer non-relation fields) uses compact format', () => {
    // 2 non-relation fields, 0 relations => compact
    const model = makeModel({
      name: 'Setting',
      fields: [
        makeField({ name: 'key', type: 'String' }),
        makeField({ name: 'value', type: 'String' }),
      ],
    });
    const result = formatSchema([model])!;
    // Compact format: **ModelName** field1 | field2
    expect(result).toContain('**Setting**');
    expect(result).toContain('key | value');
    // Compact format should NOT have a table header
    expect(result).not.toContain('| Field | Type | Attributes |');
  });

  it('compact format shows attributes in parens', () => {
    const model = makeModel({
      name: 'Token',
      fields: [
        makeField({ name: 'id', type: 'Int', attributes: ['PK'] }),
        makeField({ name: 'hash', type: 'String', attributes: ['UQ'] }),
      ],
    });
    const result = formatSchema([model])!;
    expect(result).toContain('id(PK)');
    expect(result).toContain('hash(UQ)');
  });

  it('complex model (4+ non-relation fields) uses full table', () => {
    const model = makeModel({
      name: 'Product',
      fields: [
        makeField({ name: 'id', type: 'Int', attributes: ['PK'] }),
        makeField({ name: 'name', type: 'String' }),
        makeField({ name: 'price', type: 'Float' }),
        makeField({ name: 'stock', type: 'Int' }),
      ],
    });
    const result = formatSchema([model])!;
    // Full format uses ## heading and table
    expect(result).toContain('## Product');
    expect(result).toContain('| Field | Type | Attributes |');
    expect(result).toContain('`price`');
  });

  it('relation fields shown separately from regular fields', () => {
    const model = makeModel({
      name: 'Order',
      fields: [
        makeField({ name: 'id', type: 'Int', attributes: ['PK'] }),
        makeField({ name: 'total', type: 'Float' }),
        makeField({ name: 'status', type: 'String' }),
        makeField({ name: 'item', type: 'String' }),
        makeField({ name: 'user', type: 'User', isRelation: true }),
      ],
    });
    const result = formatSchema([model])!;
    // Relations appear in a separate row with "Relations:" label
    expect(result).toContain('**Relations:**');
    expect(result).toContain('user: User');
  });

  it('compact format shows relations with arrow notation', () => {
    const model = makeModel({
      name: 'Comment',
      fields: [
        makeField({ name: 'id', type: 'Int' }),
        makeField({ name: 'body', type: 'String' }),
        makeField({ name: 'post', type: 'Post', isRelation: true }),
      ],
    });
    const result = formatSchema([model])!;
    // Compact relation format uses arrow
    expect(result).toContain('\u2192 Post');
  });

  it('optional fields show ? suffix in full table', () => {
    const model = makeModel({
      name: 'Profile',
      fields: [
        makeField({ name: 'id', type: 'Int', attributes: ['PK'] }),
        makeField({ name: 'bio', type: 'String', required: false }),
        makeField({ name: 'avatar', type: 'String', required: false }),
        makeField({ name: 'theme', type: 'String', required: false }),
      ],
    });
    const result = formatSchema([model])!;
    expect(result).toContain('`String?`');
  });
});
