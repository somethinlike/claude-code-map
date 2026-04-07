import { describe, it, expect } from 'vitest';
import { truncate, groupBy } from './utils.ts';

describe('truncate', () => {
  it('returns string unchanged when under maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when exactly at maxLen', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('clips and adds "..." when string exceeds maxLen', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('returns empty string unchanged', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('groupBy', () => {
  it('returns empty object for empty array', () => {
    expect(groupBy([], () => 'key')).toEqual({});
  });

  it('groups items by key function', () => {
    const items = [
      { name: 'a', type: 'x' },
      { name: 'b', type: 'y' },
      { name: 'c', type: 'x' },
    ];
    const result = groupBy(items, (i) => i.type);
    expect(result).toEqual({
      x: [
        { name: 'a', type: 'x' },
        { name: 'c', type: 'x' },
      ],
      y: [{ name: 'b', type: 'y' }],
    });
  });

  it('preserves order within groups', () => {
    const items = [
      { id: 1, cat: 'a' },
      { id: 2, cat: 'a' },
      { id: 3, cat: 'a' },
    ];
    const result = groupBy(items, (i) => i.cat);
    expect(result['a'].map((i) => i.id)).toEqual([1, 2, 3]);
  });
});
