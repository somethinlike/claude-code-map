import { describe, it, expect } from 'vitest';
import { formatTypes } from './types-md.ts';
import type { ExtractedType, TypeField, SupportedLanguage } from '../types.ts';

function makeField(overrides: Partial<TypeField> = {}): TypeField {
  return {
    name: 'id',
    type: 'string',
    optional: false,
    ...overrides,
  };
}

function makeType(overrides: Partial<ExtractedType> = {}): ExtractedType {
  return {
    name: 'User',
    kind: 'interface',
    fields: [
      makeField({ name: 'id', type: 'string' }),
      makeField({ name: 'email', type: 'string' }),
    ],
    filePath: 'src/types.ts',
    line: 1,
    isExported: true,
    language: 'typescript' as SupportedLanguage,
    ...overrides,
  };
}

describe('formatTypes', () => {
  it('empty types array contains "No types found"', () => {
    const result = formatTypes([]);
    expect(result).toContain('No types found');
  });

  it('output starts with # Types header', () => {
    const result = formatTypes([]);
    expect(result).toMatch(/^# Types/);
  });

  it('interface with fields produces field table', () => {
    const t = makeType({
      name: 'Config',
      fields: [
        makeField({ name: 'host', type: 'string' }),
        makeField({ name: 'port', type: 'number' }),
      ],
    });
    const result = formatTypes([t]);
    expect(result).toContain('### Config (interface)');
    expect(result).toContain('| Field | Type | Optional |');
    expect(result).toContain('`host`');
    expect(result).toContain('`port`');
  });

  it('optional fields show ? marker', () => {
    const t = makeType({
      name: 'Options',
      fields: [
        makeField({ name: 'debug', type: 'boolean', optional: true }),
      ],
    });
    const result = formatTypes([t]);
    expect(result).toContain('| `debug` | `boolean` | ? |');
  });

  it('enum with 8 or fewer members shows inline format', () => {
    const t = makeType({
      name: 'Color',
      kind: 'enum',
      fields: ['Red', 'Green', 'Blue'].map((n) => makeField({ name: n })),
    });
    const result = formatTypes([t]);
    expect(result).toContain('**enum** `Color`: Red | Green | Blue');
  });

  it('enum with exactly 8 members still uses inline format', () => {
    const members = Array.from({ length: 8 }, (_, i) => `Val${i}`);
    const t = makeType({
      name: 'Octet',
      kind: 'enum',
      fields: members.map((n) => makeField({ name: n })),
    });
    const result = formatTypes([t]);
    expect(result).toContain(members.join(' | '));
    expect(result).not.toContain('more');
  });

  it('enum with 9+ members truncates to first 6 + remaining count', () => {
    const members = Array.from({ length: 10 }, (_, i) => `Item${i}`);
    const t = makeType({
      name: 'BigEnum',
      kind: 'enum',
      fields: members.map((n) => makeField({ name: n })),
    });
    const result = formatTypes([t]);
    // First 6 shown
    expect(result).toContain('Item0 | Item1 | Item2 | Item3 | Item4 | Item5');
    // Remaining 4 collapsed
    expect(result).toContain('+4 more');
  });

  it('interface with 6+ fields truncates to first 5 + "...and N more fields"', () => {
    const fields = Array.from({ length: 7 }, (_, i) =>
      makeField({ name: `field${i}`, type: 'string' }),
    );
    const t = makeType({ name: 'Large', fields });
    const result = formatTypes([t]);
    // First 5 shown
    expect(result).toContain('`field0`');
    expect(result).toContain('`field4`');
    // 6th not shown inline
    expect(result).not.toContain('| `field5`');
    // Remainder message
    expect(result).toContain('...and 2 more fields');
  });

  it('types grouped by file with file heading', () => {
    const types = [
      makeType({ name: 'Foo', filePath: 'src/a.ts' }),
      makeType({ name: 'Bar', filePath: 'src/b.ts' }),
      makeType({ name: 'Baz', filePath: 'src/a.ts' }),
    ];
    const result = formatTypes(types);
    expect(result).toContain('## src/a.ts');
    expect(result).toContain('## src/b.ts');
  });

  it('type alias renders with type keyword', () => {
    const t = makeType({ name: 'ID', kind: 'type', fields: [] });
    const result = formatTypes([t]);
    expect(result).toContain('**type** `ID`');
  });
});
