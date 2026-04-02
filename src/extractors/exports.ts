import type { ExtractedSymbol, SupportedLanguage } from '../types.ts';
import { extractTsExports } from '../queries/typescript.ts';
import { extractPyExports } from '../queries/python.ts';
import { extractGoExports } from '../queries/go.ts';
import { extractRustExports } from '../queries/rust.ts';
import { extractJavaExports } from '../queries/java.ts';
import { extractCsharpExports } from '../queries/csharp.ts';

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
    case 'python':
      return extractPyExports(tree, language, filePath);
    case 'go':
      return extractGoExports(tree, language, filePath);
    case 'rust':
      return extractRustExports(tree, language, filePath);
    case 'java':
      return extractJavaExports(tree, language, filePath);
    case 'csharp':
      return extractCsharpExports(tree, language, filePath);
    default:
      return [];
  }
}
