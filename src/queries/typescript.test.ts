import { describe, it, expect } from 'vitest';
import { parseInterfaceBody, parseEnumBody } from './typescript.ts';

describe('parseInterfaceBody', () => {
  it('parses simple fields', () => {
    const fields = parseInterfaceBody('{ name: string; age: number }');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: 'name', type: 'string', optional: false });
    expect(fields[1]).toEqual({ name: 'age', type: 'number', optional: false });
  });

  it('parses readonly fields', () => {
    const fields = parseInterfaceBody('{ readonly id: string }');
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('id');
    expect(fields[0].type).toBe('string');
  });

  it('parses optional fields', () => {
    const fields = parseInterfaceBody('{ email?: string }');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ name: 'email', type: 'string', optional: true });
  });
});

describe('parseEnumBody', () => {
  it('parses simple enum members', () => {
    const fields = parseEnumBody('{ Active, Inactive, Pending }');
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.name)).toEqual(['Active', 'Inactive', 'Pending']);
    expect(fields.every((f) => f.type === 'member')).toBe(true);
  });

  it('parses enum members with values', () => {
    const fields = parseEnumBody('{ A = 1, B = 2 }');
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('A');
    expect(fields[1].name).toBe('B');
  });
});
