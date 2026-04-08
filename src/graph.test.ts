import { describe, it, expect } from 'vitest';
import { buildImportGraph, computeBlastRadius, formatBlastRadius, countExternalDeps } from './graph.ts';
import type { ParsedFile, ExtractedRoute, ExtractedModel } from './types.ts';

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

describe('buildImportGraph', () => {
  it('builds edges from resolved imports', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: './c', resolvedPath: 'src/c.ts', isExternal: false },
      ]),
      'src/c.ts': makeParsedFile('src/c.ts'),
    };

    const graph = buildImportGraph(files);
    expect(graph.edges).toHaveLength(2);
    expect(graph.adjacency['src/a.ts']).toEqual(['src/b.ts']);
    expect(graph.adjacency['src/b.ts']).toEqual(['src/c.ts']);
    expect(graph.reverseAdjacency['src/b.ts']).toEqual(['src/a.ts']);
    expect(graph.reverseAdjacency['src/c.ts']).toEqual(['src/b.ts']);
  });

  it('skips external imports', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: 'react', resolvedPath: null, isExternal: true },
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts'),
    };

    const graph = buildImportGraph(files);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: 'src/a.ts', to: 'src/b.ts' });
  });

  it('deduplicates edges per file', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
        { source: './b.ts', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts'),
    };

    const graph = buildImportGraph(files);
    expect(graph.edges).toHaveLength(1);
  });

  it('computes hot files sorted by in-degree', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: './shared', resolvedPath: 'src/shared.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: './shared', resolvedPath: 'src/shared.ts', isExternal: false },
      ]),
      'src/c.ts': makeParsedFile('src/c.ts', [
        { source: './shared', resolvedPath: 'src/shared.ts', isExternal: false },
      ]),
      'src/shared.ts': makeParsedFile('src/shared.ts'),
    };

    const graph = buildImportGraph(files);
    expect(graph.hotFiles[0].filePath).toBe('src/shared.ts');
    expect(graph.hotFiles[0].importedBy).toBe(3);
  });

  it('handles empty input', () => {
    const graph = buildImportGraph({});
    expect(graph.edges).toHaveLength(0);
    expect(graph.hotFiles).toHaveLength(0);
  });

  it('handles cyclic imports without infinite loop', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: './a', resolvedPath: 'src/a.ts', isExternal: false },
      ]),
    };

    const graph = buildImportGraph(files);
    expect(graph.edges).toHaveLength(2);
    // Both files have in-degree 1 and out-degree 1
    expect(graph.hotFiles).toHaveLength(2);
  });
});

describe('computeBlastRadius', () => {
  it('finds direct dependents at depth 1', () => {
    const files: Record<string, ParsedFile> = {
      'src/db.ts': makeParsedFile('src/db.ts'),
      'src/users.ts': makeParsedFile('src/users.ts', [
        { source: './db', resolvedPath: 'src/db.ts', isExternal: false },
      ]),
      'src/posts.ts': makeParsedFile('src/posts.ts', [
        { source: './db', resolvedPath: 'src/db.ts', isExternal: false },
      ]),
    };

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/db.ts', 1, [], []);
    expect(blast.affectedFiles).toHaveLength(2);
    expect(blast.affectedFiles).toContain('src/users.ts');
    expect(blast.affectedFiles).toContain('src/posts.ts');
  });

  it('follows transitive dependencies', () => {
    const files: Record<string, ParsedFile> = {
      'src/db.ts': makeParsedFile('src/db.ts'),
      'src/users.ts': makeParsedFile('src/users.ts', [
        { source: './db', resolvedPath: 'src/db.ts', isExternal: false },
      ]),
      'src/routes.ts': makeParsedFile('src/routes.ts', [
        { source: './users', resolvedPath: 'src/users.ts', isExternal: false },
      ]),
    };

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/db.ts', 3, [], []);
    expect(blast.affectedFiles).toHaveLength(2);
    expect(blast.affectedFiles).toContain('src/users.ts');
    expect(blast.affectedFiles).toContain('src/routes.ts');
  });

  it('handles cyclic dependencies without infinite loop', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: './a', resolvedPath: 'src/a.ts', isExternal: false },
      ]),
    };

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/a.ts', 10, [], []);
    expect(blast.affectedFiles).toHaveLength(1);
    expect(blast.affectedFiles).toContain('src/b.ts');
  });

  it('respects maxDepth', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts'),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: './a', resolvedPath: 'src/a.ts', isExternal: false },
      ]),
      'src/c.ts': makeParsedFile('src/c.ts', [
        { source: './b', resolvedPath: 'src/b.ts', isExternal: false },
      ]),
      'src/d.ts': makeParsedFile('src/d.ts', [
        { source: './c', resolvedPath: 'src/c.ts', isExternal: false },
      ]),
    };

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/a.ts', 1, [], []);
    expect(blast.affectedFiles).toEqual(['src/b.ts']);
  });

  it('includes affected routes and models', () => {
    const files: Record<string, ParsedFile> = {
      'src/db.ts': makeParsedFile('src/db.ts'),
      'src/routes.ts': makeParsedFile('src/routes.ts', [
        { source: './db', resolvedPath: 'src/db.ts', isExternal: false },
      ]),
    };

    const routes: ExtractedRoute[] = [
      { method: 'GET', path: '/users', filePath: 'src/routes.ts', line: 5, handler: '', auth: false, framework: 'express' },
    ];
    const models: ExtractedModel[] = [
      { name: 'User', fields: [], filePath: 'src/db.ts', orm: 'prisma' },
    ];

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/db.ts', 3, routes, models);
    expect(blast.affectedRoutes).toContain('GET /users');
    expect(blast.affectedModels).toContain('User');
  });

  it('returns empty for files with no dependents', () => {
    const files: Record<string, ParsedFile> = {
      'src/leaf.ts': makeParsedFile('src/leaf.ts', [
        { source: './lib', resolvedPath: 'src/lib.ts', isExternal: false },
      ]),
      'src/lib.ts': makeParsedFile('src/lib.ts'),
    };

    const graph = buildImportGraph(files);
    const blast = computeBlastRadius(graph, 'src/leaf.ts', 3, [], []);
    expect(blast.affectedFiles).toHaveLength(0);
  });
});

describe('formatBlastRadius', () => {
  it('formats no-dependents message', () => {
    const result = formatBlastRadius({
      targetFile: 'src/leaf.ts',
      affectedFiles: [],
      depth: 3,
      affectedRoutes: [],
      affectedModels: [],
    });
    expect(result).toContain('No other files depend on this file');
  });

  it('formats affected files list', () => {
    const result = formatBlastRadius({
      targetFile: 'src/db.ts',
      affectedFiles: ['src/users.ts', 'src/posts.ts'],
      depth: 3,
      affectedRoutes: ['GET /users'],
      affectedModels: ['User'],
    });
    expect(result).toContain('2 affected files');
    expect(result).toContain('src/users.ts');
    expect(result).toContain('GET /users');
    expect(result).toContain('User');
  });
});

describe('countExternalDeps', () => {
  it('counts external package usage across files', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: 'react', resolvedPath: null, isExternal: true },
        { source: 'express', resolvedPath: null, isExternal: true },
      ]),
      'src/b.ts': makeParsedFile('src/b.ts', [
        { source: 'react', resolvedPath: null, isExternal: true },
      ]),
    };

    const deps = countExternalDeps(files);
    expect(deps[0].name).toBe('react');
    expect(deps[0].usedBy).toBe(2);
    expect(deps[1].name).toBe('express');
    expect(deps[1].usedBy).toBe(1);
  });

  it('normalizes scoped packages', () => {
    const files: Record<string, ParsedFile> = {
      'src/a.ts': makeParsedFile('src/a.ts', [
        { source: '@anthropic-ai/sdk/something', resolvedPath: null, isExternal: true },
      ]),
    };

    const deps = countExternalDeps(files);
    expect(deps[0].name).toBe('@anthropic-ai/sdk');
  });
});
