import { readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';
import { EXTENSION_MAP, DEFAULT_EXCLUDE, DEFAULT_SKIP_PATTERNS } from './types.ts';
import type { ScannedFile, CodemapConfig, FileNode, DetectedFramework, SupportedLanguage } from './types.ts';

export function loadGitignore(projectRoot: string): string[] {
  const gitignorePath = join(projectRoot, '.gitignore');
  if (!existsSync(gitignorePath)) return [];
  const content = readFileSync(gitignorePath, 'utf-8');
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.replace(/\/$/, '')); // strip trailing slashes
}

export async function scanFiles(projectRoot: string, config: CodemapConfig): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const excludeDirs = new Set([...DEFAULT_EXCLUDE, ...config.exclude]);

  const gitignorePatterns = loadGitignore(projectRoot);
  for (const pattern of gitignorePatterns) {
    excludeDirs.add(pattern);
  }

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or symlink issues
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(projectRoot, fullPath);

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        // If include dirs specified, only walk those top-level dirs
        if (config.include.length > 0 && dirname(relPath) === '.') {
          if (!config.include.includes(entry.name)) continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      // Check extension
      const ext = extname(entry.name);
      const language = EXTENSION_MAP[ext];
      if (!language) continue;

      // Check skip patterns
      const name = entry.name;
      const shouldSkip = DEFAULT_SKIP_PATTERNS.some((pattern) => name.includes(pattern));
      if (shouldSkip) continue;

      // Get file stats
      try {
        const fileStat = await stat(fullPath);
        results.push({
          absolutePath: fullPath,
          relativePath: relPath.replace(/\\/g, '/'),
          language,
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
        });
      } catch {
        // Stat failed, skip file
      }
    }
  }

  await walk(projectRoot);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

export function buildFileTree(
  files: ScannedFile[],
  projectRoot: string,
  framework: DetectedFramework,
): FileNode {
  const root: FileNode = {
    name: basename(projectRoot),
    relativePath: '.',
    isDirectory: true,
    children: [],
  };

  const entryPointSet = new Set(framework.entryPoints);

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join('/');

      if (isLast) {
        let annotation: string | undefined;
        if (entryPointSet.has(file.relativePath)) annotation = 'entry';
        else if (isRouteFile(file.relativePath, framework)) annotation = 'route';
        else if (isSchemaFile(file.relativePath)) annotation = 'schema';

        current.children.push({
          name: part,
          relativePath: partPath,
          isDirectory: false,
          children: [],
          annotation,
          language: file.language,
        });
      } else {
        let child = current.children.find((c) => c.name === part && c.isDirectory);
        if (!child) {
          child = {
            name: part,
            relativePath: partPath,
            isDirectory: true,
            children: [],
          };
          current.children.push(child);
        }
        current = child;
      }
    }
  }

  return root;
}

function isRouteFile(filePath: string, framework: DetectedFramework): boolean {
  if (framework.id === 'nextjs-app' || framework.id === 'nextjs-both') {
    return filePath.includes('/route.') || filePath.includes('/page.');
  }
  if (framework.id === 'nextjs-pages') {
    return filePath.startsWith('pages/');
  }
  if (framework.id === 'astro') {
    return filePath.startsWith('src/pages/');
  }
  if (framework.id === 'django') {
    return filePath.endsWith('urls.py');
  }
  return false;
}

function isSchemaFile(filePath: string): boolean {
  return (
    filePath.includes('schema.prisma') ||
    filePath.includes('models.py') ||
    filePath.endsWith('.entity.ts') ||
    filePath.includes('drizzle/schema')
  );
}
