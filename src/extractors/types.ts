import type { ExtractedType, SupportedLanguage } from '../types.ts';
import { extractTsTypes } from '../queries/typescript.ts';

export async function extractTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return extractTsTypes(tree, language, filePath);
    default:
      return [];
  }
}
