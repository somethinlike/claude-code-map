import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHook } from './hook.ts';

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codemap-hook-'));
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  return dir;
}

describe('installHook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates pre-commit hook in empty .git/hooks/', () => {
    const project = makeTempProject();
    installHook(project);

    const hookPath = join(project, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('claude-code-map');
    expect(content).toContain('npx claude-code-map --quiet 2>/dev/null || true');
    expect(content).toContain('git add .codemap/ 2>/dev/null || true');
  });

  it('appends to existing pre-commit hook without clobbering', () => {
    const project = makeTempProject();
    const hookPath = join(project, '.git', 'hooks', 'pre-commit');
    const existingContent = '#!/bin/sh\necho "existing hook"\n';
    writeFileSync(hookPath, existingContent);

    installHook(project);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo "existing hook"');
    expect(content).toContain('claude-code-map');
  });

  it('detects already-installed hook and skips', () => {
    const project = makeTempProject();
    const hookPath = join(project, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\nnpx claude-code-map 2>/dev/null\n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    installHook(project);

    expect(logSpy).toHaveBeenCalledWith('[codemap] Hook already installed');

    // Verify no duplicate stanzas
    const content = readFileSync(hookPath, 'utf-8');
    const matches = content.match(/claude-code-map/g);
    expect(matches?.length).toBe(1);
  });

  it('throws on non-git directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemap-hook-nogit-'));
    expect(() => installHook(dir)).toThrow('Not a git repository');
  });
});
