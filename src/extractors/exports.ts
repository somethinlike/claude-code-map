import type { ExtractedSymbol, SupportedLanguage } from '../types.ts';
import { extractTsExports } from '../queries/typescript.ts';

export function extractExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): ExtractedSymbol[] {
  // For v1, TypeScript/JavaScript/TSX/JSX use the TS extractor
  // Other languages will get their own query modules in Phase 6
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      // extractTsExports is async but we need sync — use the pattern of
      // returning a promise and letting the caller await
      return [] as ExtractedSymbol[]; // Placeholder — see extractExportsAsync
    default:
      return [];
  }
}

// Async version used by cli.ts
export async function extractExportsAsync(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return extractTsExports(tree, language, filePath);
    default:
      return [];
  }
}
