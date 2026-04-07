import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lookupSymbol } from './lookup.ts';
import type { ParsedFile } from './types.ts';

function makeCacheDir(data: Record<string, ParsedFile>): string {
  const dir = mkdtempSync(join(tmpdir(), 'codemap-lookup-'));
  writeFileSync(join(dir, 'cache-data.json'), JSON.stringify(data));
  return dir;
}

const mockParsedFiles: Record<string, ParsedFile> = {
  'src/auth.ts': {
    filePath: 'src/auth.ts',
    language: 'typescript',
    symbols: [
      { name: 'loginUser', kind: 'function', signature: 'loginUser()', filePath: 'src/auth.ts', line: 5, isExported: true, isDefault: false, language: 'typescript' },
      { name: 'logoutUser', kind: 'function', signature: 'logoutUser()', filePath: 'src/auth.ts', line: 20, isExported: true, isDefault: false, language: 'typescript' },
    ],
    routes: [],
    types: [
      { name: 'AuthConfig', kind: 'interface', fields: [], filePath: 'src/auth.ts', line: 1, isExported: true, language: 'typescript' },
    ],
  },
  'src/utils.ts': {
    filePath: 'src/utils.ts',
    language: 'typescript',
    symbols: [
      { name: 'formatDate', kind: 'function', signature: 'formatDate()', filePath: 'src/utils.ts', line: 1, isExported: true, isDefault: false, language: 'typescript' },
    ],
    routes: [],
    types: [
      { name: 'DateFormat', kind: 'type', fields: [], filePath: 'src/utils.ts', line: 10, isExported: true, language: 'typescript' },
    ],
  },
};

describe('lookupSymbol', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('finds exact match by name', () => {
    const dir = makeCacheDir(mockParsedFiles);
    const results = lookupSymbol('loginUser', dir);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('loginUser');
    expect(results[0].kind).toBe('function');
    expect(results[0].filePath).toBe('src/auth.ts');
  });

  it('finds partial match (substring)', () => {
    const dir = makeCacheDir(mockParsedFiles);
    const results = lookupSymbol('login', dir);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('loginUser');
  });

  it('case-insensitive matching', () => {
    const dir = makeCacheDir(mockParsedFiles);
    const results = lookupSymbol('LOGINUSER', dir);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('loginUser');
  });

  it('returns both symbols and types', () => {
    const dir = makeCacheDir(mockParsedFiles);
    const results = lookupSymbol('auth', dir);
    // Should match AuthConfig (type) from types array
    expect(results.some(r => r.name === 'AuthConfig')).toBe(true);
  });

  it('no matches returns empty', () => {
    const dir = makeCacheDir(mockParsedFiles);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = lookupSymbol('nonexistent', dir);
    expect(results).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith("No symbols matching 'nonexistent' found.");
  });

  it('handles missing cache data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemap-lookup-empty-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = lookupSymbol('anything', dir);
    expect(results).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith("No index found. Run `claude-code-map` first.");
  });
});
