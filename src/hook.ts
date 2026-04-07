import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_STANZA = `
# claude-code-map: auto-regenerate index on commit
npx claude-code-map 2>/dev/null
git add .codemap/ 2>/dev/null
`;

const SHEBANG = '#!/bin/sh\n';

export function installHook(projectRoot: string): void {
  const gitDir = join(projectRoot, '.git');
  if (!existsSync(gitDir)) {
    throw new Error('Not a git repository');
  }

  const hooksDir = join(gitDir, 'hooks');
  const preCommitPath = join(hooksDir, 'pre-commit');

  // Check if hook already installed
  if (existsSync(preCommitPath)) {
    const existing = readFileSync(preCommitPath, 'utf-8');
    if (existing.includes('claude-code-map')) {
      console.log('[codemap] Hook already installed');
      return;
    }

    // Append to existing hook
    writeFileSync(preCommitPath, existing.trimEnd() + '\n' + HOOK_STANZA);
    chmodSync(preCommitPath, 0o755);
    console.log('[codemap] Appended hook to existing pre-commit');
    return;
  }

  // Create hooks dir if needed, write new hook
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(preCommitPath, SHEBANG + HOOK_STANZA);
  chmodSync(preCommitPath, 0o755);
  console.log('[codemap] Installed pre-commit hook');
}
