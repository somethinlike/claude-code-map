import { describe, it, expect } from 'vitest';
import { parseArgs } from './cli.ts';

describe('parseArgs', () => {
  it('returns defaults with no args', () => {
    const result = parseArgs(['node', 'script']);
    expect(result.action).toBe('run');
    expect(result.include).toEqual([]);
    expect(result.exclude).toEqual([]);
    expect(result.schema).toEqual([]);
    expect(result.force).toBe(false);
  });

  it('parses --help', () => {
    expect(parseArgs(['node', 'script', '--help']).action).toBe('help');
  });

  it('parses -h', () => {
    expect(parseArgs(['node', 'script', '-h']).action).toBe('help');
  });

  it('parses --version', () => {
    expect(parseArgs(['node', 'script', '--version']).action).toBe('version');
  });

  it('parses -v', () => {
    expect(parseArgs(['node', 'script', '-v']).action).toBe('version');
  });

  it('parses --force', () => {
    expect(parseArgs(['node', 'script', '--force']).force).toBe(true);
  });

  it('parses --output with value', () => {
    expect(parseArgs(['node', 'script', '--output', 'custom-dir']).output).toBe('custom-dir');
  });

  it('parses multiple --include flags', () => {
    const result = parseArgs(['node', 'script', '--include', 'src', '--include', 'lib']);
    expect(result.include).toEqual(['src', 'lib']);
  });

  it('parses --schema', () => {
    const result = parseArgs(['node', 'script', '--schema', 'prisma/schema.prisma']);
    expect(result.schema).toEqual(['prisma/schema.prisma']);
  });
});
