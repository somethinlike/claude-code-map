import { describe, it, expect } from 'vitest';
import { parsePhpInterfaceBody, parsePhpEnumBody } from './php.ts';

describe('parsePhpInterfaceBody', () => {
  it('extracts method signatures from interface body', () => {
    const body = `{
    public function getName(): string;
    public function setAge(int $age): void;
    public function getOptional(): ?int;
}`;
    const fields = parsePhpInterfaceBody(body);
    expect(fields).toHaveLength(3);
    expect(fields[0]).toEqual({ name: 'getName', type: 'string', optional: false });
    expect(fields[1]).toEqual({ name: 'setAge', type: 'void', optional: false });
    expect(fields[2]).toEqual({ name: 'getOptional', type: '?int', optional: true });
  });

  it('returns empty array for body with no methods', () => {
    const fields = parsePhpInterfaceBody('{ }');
    expect(fields).toEqual([]);
  });
});

describe('parsePhpEnumBody', () => {
  it('extracts enum cases', () => {
    const body = `{
    case Hearts;
    case Diamonds;
    case Clubs;
    case Spades;
}`;
    const fields = parsePhpEnumBody(body);
    expect(fields).toHaveLength(4);
    expect(fields[0]).toEqual({ name: 'Hearts', type: 'case', optional: false });
    expect(fields[3]).toEqual({ name: 'Spades', type: 'case', optional: false });
  });

  it('returns empty array for empty enum', () => {
    const fields = parsePhpEnumBody('{ }');
    expect(fields).toEqual([]);
  });
});
