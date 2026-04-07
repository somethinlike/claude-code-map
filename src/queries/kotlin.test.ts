import { describe, it, expect } from 'vitest';
import { parseKotlinInterfaceBody } from './kotlin.ts';

describe('parseKotlinInterfaceBody', () => {
  it('extracts val/var properties', () => {
    const body = `{
    val name: String
    var age: Int
    val email: String?
}`;
    const fields = parseKotlinInterfaceBody(body);
    expect(fields).toHaveLength(3);
    expect(fields[0]).toEqual({ name: 'name', type: 'String', optional: false });
    expect(fields[1]).toEqual({ name: 'age', type: 'Int', optional: false });
    expect(fields[2]).toEqual({ name: 'email', type: 'String', optional: true });
  });

  it('extracts fun declarations', () => {
    const body = `{
    fun greet(name: String): String
    fun process(): Unit
    fun compute(x: Int, y: Int)
}`;
    const fields = parseKotlinInterfaceBody(body);
    expect(fields).toHaveLength(3);
    expect(fields[0]).toEqual({ name: 'greet', type: 'String', optional: false });
    expect(fields[1]).toEqual({ name: 'process', type: 'Unit', optional: false });
    expect(fields[2]).toEqual({ name: 'compute', type: 'Unit', optional: false });
  });

  it('handles mixed properties and functions', () => {
    const body = `{
    val id: Long
    fun save(): Boolean
}`;
    const fields = parseKotlinInterfaceBody(body);
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('id');
    expect(fields[1].name).toBe('save');
  });

  it('returns empty for empty body', () => {
    const fields = parseKotlinInterfaceBody('{ }');
    expect(fields).toEqual([]);
  });
});
