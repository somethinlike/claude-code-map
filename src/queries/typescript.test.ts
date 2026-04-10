import { describe, it, expect, beforeAll } from 'vitest';
import { initParser, parseSource } from '../parser.ts';
import { parseInterfaceBody, parseEnumBody, extractTsImports, extractTsExports } from './typescript.ts';

describe('parseInterfaceBody', () => {
  it('parses simple fields', () => {
    const fields = parseInterfaceBody('{ name: string; age: number }');
    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: 'name', type: 'string', optional: false });
    expect(fields[1]).toEqual({ name: 'age', type: 'number', optional: false });
  });

  it('parses readonly fields', () => {
    const fields = parseInterfaceBody('{ readonly id: string }');
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('id');
    expect(fields[0].type).toBe('string');
  });

  it('parses optional fields', () => {
    const fields = parseInterfaceBody('{ email?: string }');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ name: 'email', type: 'string', optional: true });
  });
});

describe('parseEnumBody', () => {
  it('parses simple enum members', () => {
    const fields = parseEnumBody('{ Active, Inactive, Pending }');
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.name)).toEqual(['Active', 'Inactive', 'Pending']);
    expect(fields.every((f) => f.type === 'member')).toBe(true);
  });

  it('parses enum members with values', () => {
    const fields = parseEnumBody('{ A = 1, B = 2 }');
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('A');
    expect(fields[1].name).toBe('B');
  });
});

describe('extractTsImports — re-export forms', () => {
  beforeAll(async () => {
    await initParser();
  });

  it('extracts wildcard re-exports as imports', async () => {
    const source = `
      export * from './languages.ts';
      export * from './symbols.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/types.ts');
    const sources = imports.map((i) => i.source).sort();
    expect(sources).toEqual(['./languages.ts', './symbols.ts']);
  });

  it('extracts named re-exports as imports', async () => {
    const source = `
      export { Foo, Bar } from './foo.ts';
      export { Baz as Qux } from './baz.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/index.ts');
    const sources = imports.map((i) => i.source).sort();
    expect(sources).toEqual(['./baz.ts', './foo.ts']);
  });

  it('extracts type-only re-exports as imports', async () => {
    const source = `
      export type * from './types.ts';
      export type { Config } from './config.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/index.ts');
    const sources = imports.map((i) => i.source).sort();
    expect(sources).toEqual(['./config.ts', './types.ts']);
  });

  it('still extracts standard imports alongside re-exports', async () => {
    const source = `
      import { foo } from './foo.ts';
      export * from './bar.ts';
      import type { Baz } from './baz.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/index.ts');
    const sources = imports.map((i) => i.source).sort();
    expect(sources).toEqual(['./bar.ts', './baz.ts', './foo.ts']);
  });

  it('deduplicates when the same source appears as both import and re-export', async () => {
    const source = `
      import { foo } from './shared.ts';
      export * from './shared.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/index.ts');
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./shared.ts');
  });

  it('marks re-exports as external when source is a bare specifier', async () => {
    const source = `
      export * from 'lodash';
      export { Component } from 'react';
    `;
    const tree = await parseSource(source, 'typescript');
    const imports = await extractTsImports(tree, 'typescript', 'src/index.ts');
    expect(imports).toHaveLength(2);
    expect(imports.every((i) => i.isExternal)).toBe(true);
  });
});

describe('extractTsExports — re-exports remain invisible (intentional)', () => {
  beforeAll(async () => {
    await initParser();
  });

  it('does not count re-exports as exports', async () => {
    // This is the property that makes barrel files invisible to the
    // monolith audit rule — they exist but produce zero counted exports.
    const source = `
      export * from './foo.ts';
      export * from './bar.ts';
      export { Baz } from './baz.ts';
    `;
    const tree = await parseSource(source, 'typescript');
    const symbols = await extractTsExports(tree, 'typescript', 'src/types.ts');
    expect(symbols).toHaveLength(0);
  });

  it('counts direct exports normally even when re-exports are present', async () => {
    const source = `
      export * from './bar.ts';
      export const FOO = 1;
      export function helper() {}
    `;
    const tree = await parseSource(source, 'typescript');
    const symbols = await extractTsExports(tree, 'typescript', 'src/index.ts');
    const names = symbols.map((s) => s.name).sort();
    expect(names).toEqual(['FOO', 'helper']);
  });
});
