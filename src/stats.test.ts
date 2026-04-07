import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getIndexStats, formatStats } from './stats.ts';

describe('getIndexStats', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codemap-stats-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-existent directory', () => {
    expect(getIndexStats(join(tmpDir, 'nope'))).toBeNull();
  });

  it('returns null for empty directory', () => {
    mkdirSync(join(tmpDir, 'empty'));
    expect(getIndexStats(join(tmpDir, 'empty'))).toBeNull();
  });

  it('counts markdown files and estimates tokens', () => {
    const dir = join(tmpDir, 'codemap');
    mkdirSync(dir);
    writeFileSync(join(dir, 'structure.md'), 'a'.repeat(350)); // ~100 tokens at 3.5 chars/token
    writeFileSync(join(dir, 'exports.md'), 'b'.repeat(700));   // ~200 tokens
    writeFileSync(join(dir, 'cache.json'), '{}');                // not .md, should be ignored

    const stats = getIndexStats(dir);
    expect(stats).not.toBeNull();
    expect(stats!.files).toHaveLength(2);
    expect(stats!.files[0].name).toBe('exports.md');
    expect(stats!.files[1].name).toBe('structure.md');
    expect(stats!.totalBytes).toBe(1050);
    expect(stats!.totalTokens).toBeGreaterThan(0);
  });
});

describe('formatStats', () => {
  it('formats stats into readable output', () => {
    const output = formatStats({
      files: [
        { name: 'exports.md', sizeBytes: 5120, estimatedTokens: 1463 },
        { name: 'structure.md', sizeBytes: 2048, estimatedTokens: 585 },
      ],
      totalBytes: 7168,
      totalTokens: 2048,
    });

    expect(output).toContain('exports.md');
    expect(output).toContain('structure.md');
    expect(output).toContain('5.0 KB');
    expect(output).toContain('Total');
    expect(output).toContain('tokens');
  });
});
