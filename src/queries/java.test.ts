import { describe, it, expect } from 'vitest';
import { parseJavaEnumBody } from './java.ts';

describe('parseJavaEnumBody', () => {
  it('parses simple enum values', () => {
    const fields = parseJavaEnumBody('{ VALUE1, VALUE2 }');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: 'VALUE1', type: 'member', optional: false });
    expect(fields[1]).toEqual({ name: 'VALUE2', type: 'member', optional: false });
  });

  it('parses enum values with constructor args', () => {
    const fields = parseJavaEnumBody('{ VALUE1("a"), VALUE2("b") }');
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('VALUE1');
    expect(fields[1].name).toBe('VALUE2');
  });

  it('stops at semicolon (ignores methods after)', () => {
    const fields = parseJavaEnumBody('{ A, B; public String getLabel() { return ""; } }');
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('A');
    expect(fields[1].name).toBe('B');
  });
});
