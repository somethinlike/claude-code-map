import { describe, it, expect } from 'vitest';
import { formatStructure, sortChildren, collapseChildren } from './structure-md.ts';
import type { FileNode, DetectedFramework, FrameworkId, SupportedLanguage } from '../types.ts';

function makeFileNode(overrides: Partial<FileNode> = {}): FileNode {
  return {
    name: 'file.ts',
    relativePath: 'file.ts',
    isDirectory: false,
    children: [],
    ...overrides,
  };
}

function makeDirNode(name: string, children: FileNode[] = []): FileNode {
  return {
    name,
    relativePath: name,
    isDirectory: true,
    children,
  };
}

function makeFramework(overrides: Partial<DetectedFramework> = {}): DetectedFramework {
  return {
    id: 'express' as FrameworkId,
    name: 'Express',
    entryPoints: [],
    routePatterns: [],
    ...overrides,
  };
}

describe('sortChildren', () => {
  it('directories sort before files', () => {
    const children: FileNode[] = [
      makeFileNode({ name: 'index.ts' }),
      makeDirNode('src'),
      makeFileNode({ name: 'readme.md' }),
      makeDirNode('lib'),
    ];
    const sorted = sortChildren(children);
    expect(sorted[0].name).toBe('lib');
    expect(sorted[1].name).toBe('src');
    expect(sorted[2].name).toBe('index.ts');
    expect(sorted[3].name).toBe('readme.md');
  });

  it('alphabetical within directories and within files separately', () => {
    const children: FileNode[] = [
      makeDirNode('zeta'),
      makeDirNode('alpha'),
      makeFileNode({ name: 'z.ts' }),
      makeFileNode({ name: 'a.ts' }),
    ];
    const sorted = sortChildren(children);
    expect(sorted.map((c) => c.name)).toEqual(['alpha', 'zeta', 'a.ts', 'z.ts']);
  });

  it('does not mutate original array', () => {
    const children: FileNode[] = [
      makeFileNode({ name: 'b.ts' }),
      makeDirNode('a'),
    ];
    const original = [...children];
    sortChildren(children);
    expect(children[0].name).toBe(original[0].name);
  });
});

describe('collapseChildren', () => {
  it('8 or fewer items returns all unchanged', () => {
    const children = Array.from({ length: 8 }, (_, i) =>
      makeFileNode({ name: `file${i}.ts` }),
    );
    const result = collapseChildren(children);
    expect(result).toHaveLength(8);
    // All items should be FileNode, not strings
    for (const item of result) {
      expect(typeof item).not.toBe('string');
    }
  });

  it('exactly 8 items does not collapse', () => {
    const children = Array.from({ length: 8 }, (_, i) =>
      makeFileNode({ name: `f${i}.ts` }),
    );
    const result = collapseChildren(children);
    expect(result).toHaveLength(8);
  });

  it('9+ items returns first 5 items + collapse summary string', () => {
    const children = Array.from({ length: 12 }, (_, i) =>
      makeFileNode({ name: `file${i}.ts` }),
    );
    const result = collapseChildren(children);
    // 5 FileNodes + 1 summary string = 6 entries
    expect(result).toHaveLength(6);
    // First 5 are FileNode objects
    for (let i = 0; i < 5; i++) {
      expect(typeof result[i]).not.toBe('string');
    }
    // Last entry is the collapse summary string
    const summary = result[5];
    expect(typeof summary).toBe('string');
    expect(summary).toBe('...7 more');
  });

  it('9 items (minimum collapse case) shows "...4 more"', () => {
    const children = Array.from({ length: 9 }, (_, i) =>
      makeFileNode({ name: `f${i}.ts` }),
    );
    const result = collapseChildren(children);
    expect(result).toHaveLength(6);
    expect(result[5]).toBe('...4 more');
  });
});

describe('formatStructure', () => {
  it('output includes framework name', () => {
    const tree = makeDirNode('project', [makeFileNode({ name: 'index.ts' })]);
    const result = formatStructure(tree, makeFramework({ name: 'Next.js (App)' }), {
      totalFiles: 1,
      languages: ['typescript' as SupportedLanguage],
    });
    expect(result).toContain('**Framework:** Next.js (App)');
  });

  it('output includes language list', () => {
    const tree = makeDirNode('project', []);
    const result = formatStructure(tree, makeFramework(), {
      totalFiles: 5,
      languages: ['typescript' as SupportedLanguage, 'python' as SupportedLanguage],
    });
    expect(result).toContain('**Languages:** typescript, python');
  });

  it('output includes file count', () => {
    const tree = makeDirNode('project', []);
    const result = formatStructure(tree, makeFramework(), {
      totalFiles: 42,
      languages: ['typescript' as SupportedLanguage],
    });
    expect(result).toContain('**Files indexed:** 42');
  });

  it('output starts with # Project Structure header', () => {
    const tree = makeDirNode('root', []);
    const result = formatStructure(tree, makeFramework(), {
      totalFiles: 0,
      languages: [],
    });
    expect(result).toMatch(/^# Project Structure/);
  });

  it('entry points section rendered when framework has entry points', () => {
    const tree = makeDirNode('project', []);
    const fw = makeFramework({
      name: 'Express',
      entryPoints: ['src/server.ts'],
    });
    const result = formatStructure(tree, fw, {
      totalFiles: 1,
      languages: ['typescript' as SupportedLanguage],
    });
    expect(result).toContain('## Entry Points');
    expect(result).toContain('`src/server.ts`');
  });
});
