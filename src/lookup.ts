import { loadCacheData } from './cache.ts';
import type { ParsedFile } from './types.ts';

export interface LookupResult {
  readonly name: string;
  readonly kind: string;
  readonly filePath: string;
}

export function lookupSymbol(symbolName: string, outputDir: string): LookupResult[] {
  const cacheData = loadCacheData(outputDir);
  if (!cacheData) {
    console.log("No index found. Run `claude-code-map` first.");
    return [];
  }

  const query = symbolName.toLowerCase();
  const results: LookupResult[] = [];

  for (const parsed of Object.values(cacheData) as ParsedFile[]) {
    for (const sym of parsed.symbols) {
      if (sym.name.toLowerCase().includes(query)) {
        results.push({ name: sym.name, kind: sym.kind, filePath: parsed.filePath });
      }
    }
    for (const typ of parsed.types) {
      if (typ.name.toLowerCase().includes(query)) {
        results.push({ name: typ.name, kind: typ.kind, filePath: parsed.filePath });
      }
    }
  }

  if (results.length === 0) {
    console.log(`No symbols matching '${symbolName}' found.`);
  } else {
    for (const r of results) {
      console.log(`  ${r.name} (${r.kind}) — ${r.filePath}`);
    }
  }

  return results;
}
