import { describe, it, expect } from 'vitest';
import { formatGraph } from './graph-md.ts';
import type { ImportGraph, ParsedFile } from '../types.ts';

function makeParsedFile(filePath: string, imports: { source: string; resolvedPath: string | null; isExternal: boolean }[] = []): ParsedFile {
  return {
    filePath,
    language: 'typescript',
    symbols: [],
    routes: [],
    types: [],
    imports: imports.map((imp) => ({
      ...imp,
      filePath,
      line: 1,
      language: 'typescript' as const,
    })),
  };
}

describe('formatGraph', () => {
  it('returns null when no edges exist', () => {
    const graph: ImportGraph = {
      edges: [],
      adjacency: {},
      reverseAdjacency: {},
      hotFiles: [],
    };
    expect(formatGraph(graph, {})).toBeNull();
  });

  it('formats hot files table', () => {
    const graph: ImportGraph = {
      edges: [
        { from: 'src/a.ts', to: 'src/shared.ts' },
        { from: 'src/b.ts', to: 'src/shared.ts' },
      ],
      adjacency: {
        'src/a.ts': ['src/shared.ts'],
        'src/b.ts': ['src/shared.ts'],
      },
      reverseAdjacency: {
        'src/shared.ts': ['src/a.ts', 'src/b.ts'],
      },
      hotFiles: [
        { filePath: 'src/shared.ts', importedBy: 2, imports: 0 },
        { filePath: 'src/a.ts', importedBy: 0, imports: 1 },
        { filePath: 'src/b.ts', importedBy: 0, imports: 1 },
      ],
    };

    const result = formatGraph(graph, {})!;
    expect(result).toContain('# Dependency Graph');
    expect(result).toContain('Internal edges:** 2');
    expect(result).toContain('Hot Files');
    expect(result).toContain('src/shared.ts');
    expect(result).toContain('| 2 |');
  });

  it('includes external dependencies section', () => {
    const parsedFiles: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: 'react', resolvedPath: null, isExternal: true },
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: 'react', resolvedPath: null, isExternal: true },
      ]),
    };

    const graph: ImportGraph = {
      edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
      adjacency: { 'src/a.ts': ['src/b.ts'] },
      reverseAdjacency: { 'src/b.ts': ['src/a.ts'] },
      hotFiles: [{ filePath: 'src/b.ts', importedBy: 1, imports: 0 }],
    };

    const result = formatGraph(graph, parsedFiles)!;
    expect(result).toContain('External Dependencies');
    expect(result).toContain('react');
    expect(result).toContain('2 files');
  });
});
