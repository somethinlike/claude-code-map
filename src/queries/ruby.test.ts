import { describe, it, expect } from 'vitest';
import { parseRubyClassFields } from './ruby.ts';

describe('parseRubyClassFields', () => {
  it('extracts attr_accessor fields', () => {
    const body = `
    attr_accessor :name, :email
    attr_reader :id
    attr_writer :password
    def initialize(name, email)
      @name = name
    end`;
    const fields = parseRubyClassFields(body);
    expect(fields).toHaveLength(4);
    expect(fields[0]).toEqual({ name: 'name', type: 'Object', optional: false });
    expect(fields[1]).toEqual({ name: 'email', type: 'Object', optional: false });
    expect(fields[2]).toEqual({ name: 'id', type: 'Object', optional: false });
    expect(fields[3]).toEqual({ name: 'password', type: 'Object', optional: false });
  });

  it('returns empty for class with no attr_ declarations', () => {
    const body = `
    def greet
      puts "hello"
    end`;
    const fields = parseRubyClassFields(body);
    expect(fields).toEqual([]);
  });

  it('handles single-symbol attr_accessor', () => {
    const fields = parseRubyClassFields('    attr_accessor :status');
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('status');
  });
});
