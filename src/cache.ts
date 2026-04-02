import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CacheManifest, ScannedFile, ParsedFile } from './types.ts';

const CACHE_VERSION = 1;
const CACHE_FILE = 'cache.json';
const CACHE_DATA_FILE = 'cache-data.json';

export function loadCache(outputDir: string): CacheManifest | null {
  const cachePath = join(outputDir, CACHE_FILE);
  if (!existsSync(cachePath)) return null;

  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (data.version !== CACHE_VERSION) return null;
    return data as CacheManifest;
  } catch {
    return null;
  }
}

export function loadCacheData(outputDir: string): Record<string, ParsedFile> | null {
  const dataPath = join(outputDir, CACHE_DATA_FILE);
  if (!existsSync(dataPath)) return null;

  try {
    return JSON.parse(readFileSync(dataPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function getChangedFiles(
  files: ScannedFile[],
  cache: CacheManifest | null,
): { changed: ScannedFile[]; unchanged: string[] } {
  if (!cache) {
    return { changed: files, unchanged: [] };
  }

  const changed: ScannedFile[] = [];
  const unchanged: string[] = [];

  for (const file of files) {
    const cached = cache.files[file.relativePath];
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      unchanged.push(file.relativePath);
    } else {
      changed.push(file);
    }
  }

  return { changed, unchanged };
}

export function writeCache(outputDir: string, files: ScannedFile[]): void {
  mkdirSync(outputDir, { recursive: true });

  const manifest: CacheManifest = {
    version: CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    files: Object.fromEntries(
      files.map((f) => [
        f.relativePath,
        { filePath: f.relativePath, mtimeMs: f.mtimeMs, size: f.size },
      ]),
    ),
  };

  writeFileSync(join(outputDir, CACHE_FILE), JSON.stringify(manifest, null, 2));
}

export function writeCacheData(outputDir: string, parsedFiles: Record<string, ParsedFile>): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, CACHE_DATA_FILE), JSON.stringify(parsedFiles));
}
