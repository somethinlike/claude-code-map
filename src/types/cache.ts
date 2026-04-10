export interface CacheEntry {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface CacheManifest {
  readonly version: number;
  readonly generatedAt: string;
  readonly files: Record<string, CacheEntry>;
}
