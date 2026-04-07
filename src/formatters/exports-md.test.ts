import { describe, it, expect } from 'vitest';
import { formatExports, sortSymbols } from './exports-md.ts';
import type { ExtractedSymbol, SymbolKind, SupportedLanguage } from '../types.ts';

function makeSymbol(overrides: Partial<ExtractedSymbol> = {}): ExtractedSymbol {
  return {
    name: 'doStuff',
    kind: 'function' as SymbolKind,
    signature: '() => void',
    filePath: 'src/lib.ts',
    line: 1,
    isExported: true,
    isDefault: false,
    language: 'typescript' as SupportedLanguage,
    ...overrides,
  };
}

describe('formatExports', () => {
  it('shows "No exported symbols found" for empty array', () => {
    const result = formatExports([]);
    expect(result).toContain('No exported symbols found');
  });

  it('output starts with # Exports header', () => {
    const result = formatExports([]);
    expect(result).toMatch(/^# Exports/);
  });

  it('single exported symbol produces file section with table header', () => {
    const sym = makeSymbol({ name: 'fetchData', filePath: 'src/api.ts' });
    const result = formatExports([sym]);
    expect(result).toContain('## src/api.ts');
    expect(result).toContain('| Export | Kind | Signature |');
    expect(result).toContain('`fetchData`');
  });

  it('non-exported symbols are excluded', () => {
    const sym = makeSymbol({ name: 'internal', isExported: false });
    const result = formatExports([sym]);
    expect(result).toContain('No exported symbols found');
  });

  it('truncates to 4 symbols per file and shows "+N more"', () => {
    const symbols = Array.from({ length: 6 }, (_, i) =>
      makeSymbol({ name: `fn${i}`, filePath: 'src/big.ts' }),
    );
    const result = formatExports(symbols);
    // Should show first 4 names
    expect(result).toContain('`fn0`');
    expect(result).toContain('`fn3`');
    // Should NOT show the 5th (index 4) inline
    expect(result).not.toContain('| `fn4`');
    // Should show remainder count
    expect(result).toContain('+2 more');
  });

  it('shows total exports count', () => {
    const symbols = [
      makeSymbol({ name: 'a', filePath: 'src/a.ts' }),
      makeSymbol({ name: 'b', filePath: 'src/b.ts' }),
    ];
    const result = formatExports(symbols);
    expect(result).toContain('**Total exports:** 2');
  });
});

describe('sortSymbols', () => {
  it('orders function before constant before variable', () => {
    const symbols: ExtractedSymbol[] = [
      makeSymbol({ name: 'myVar', kind: 'variable' }),
      makeSymbol({ name: 'MY_CONST', kind: 'constant' }),
      makeSymbol({ name: 'doThing', kind: 'function' }),
    ];
    const sorted = sortSymbols(symbols);
    expect(sorted[0].kind).toBe('function');
    expect(sorted[1].kind).toBe('constant');
    expect(sorted[2].kind).toBe('variable');
  });

  it('sorts alphabetically within the same kind', () => {
    const symbols: ExtractedSymbol[] = [
      makeSymbol({ name: 'zebra', kind: 'function' }),
      makeSymbol({ name: 'alpha', kind: 'function' }),
      makeSymbol({ name: 'mid', kind: 'function' }),
    ];
    const sorted = sortSymbols(symbols);
    expect(sorted.map((s) => s.name)).toEqual(['alpha', 'mid', 'zebra']);
  });

  it('full kind ordering: function, method, class, interface, type, enum, constant, variable', () => {
    const kinds: SymbolKind[] = ['variable', 'enum', 'type', 'interface', 'class', 'method', 'function', 'constant'];
    const symbols = kinds.map((kind) => makeSymbol({ name: kind, kind }));
    const sorted = sortSymbols(symbols);
    expect(sorted.map((s) => s.kind)).toEqual([
      'function', 'method', 'class', 'interface', 'type', 'enum', 'constant', 'variable',
    ]);
  });
});
