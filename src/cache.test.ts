import { describe, it, expect } from 'vitest';
import { getChangedFiles } from './cache.ts';
import type { ScannedFile, CacheManifest } from './types.ts';

function makeFile(relativePath: string, mtimeMs: number, size: number): ScannedFile {
  return {
    absolutePath: `/abs/${relativePath}`,
    relativePath,
    language: 'typescript',
    mtimeMs,
    size,
  };
}

function makeCache(entries: Record<string, { mtimeMs: number; size: number }>): CacheManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: Object.fromEntries(
      Object.entries(entries).map(([path, { mtimeMs, size }]) => [
        path,
        { filePath: path, mtimeMs, size },
      ]),
    ),
  };
}

describe('getChangedFiles', () => {
  it('returns all files as changed when cache is null', () => {
    const files = [makeFile('a.ts', 100, 50), makeFile('b.ts', 200, 60)];
    const result = getChangedFiles(files, null);
    expect(result.changed).toEqual(files);
    expect(result.unchanged).toEqual([]);
  });

  it('returns all files as unchanged when cache fully matches', () => {
    const files = [makeFile('a.ts', 100, 50), makeFile('b.ts', 200, 60)];
    const cache = makeCache({
      'a.ts': { mtimeMs: 100, size: 50 },
      'b.ts': { mtimeMs: 200, size: 60 },
    });
    const result = getChangedFiles(files, cache);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual(['a.ts', 'b.ts']);
  });

  it('detects changed mtime on one file', () => {
    const files = [makeFile('a.ts', 999, 50), makeFile('b.ts', 200, 60)];
    const cache = makeCache({
      'a.ts': { mtimeMs: 100, size: 50 },
      'b.ts': { mtimeMs: 200, size: 60 },
    });
    const result = getChangedFiles(files, cache);
    expect(result.changed).toEqual([files[0]]);
    expect(result.unchanged).toEqual(['b.ts']);
  });

  it('detects changed size on one file', () => {
    const files = [makeFile('a.ts', 100, 50), makeFile('b.ts', 200, 999)];
    const cache = makeCache({
      'a.ts': { mtimeMs: 100, size: 50 },
      'b.ts': { mtimeMs: 200, size: 60 },
    });
    const result = getChangedFiles(files, cache);
    expect(result.changed).toEqual([files[1]]);
    expect(result.unchanged).toEqual(['a.ts']);
  });

  it('treats a new file (not in cache) as changed', () => {
    const files = [makeFile('a.ts', 100, 50), makeFile('new.ts', 300, 70)];
    const cache = makeCache({
      'a.ts': { mtimeMs: 100, size: 50 },
    });
    const result = getChangedFiles(files, cache);
    expect(result.changed).toEqual([files[1]]);
    expect(result.unchanged).toEqual(['a.ts']);
  });

  it('does not include removed files (in cache but not in file list) in either array', () => {
    const files = [makeFile('a.ts', 100, 50)];
    const cache = makeCache({
      'a.ts': { mtimeMs: 100, size: 50 },
      'removed.ts': { mtimeMs: 150, size: 40 },
    });
    const result = getChangedFiles(files, cache);
    expect(result.changed).toEqual([]);
    expect(result.unchanged).toEqual(['a.ts']);
    // removed.ts should not appear anywhere
    const allPaths = [...result.changed.map((f) => f.relativePath), ...result.unchanged];
    expect(allPaths).not.toContain('removed.ts');
  });
});
