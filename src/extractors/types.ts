import type { ExtractedType, SupportedLanguage } from '../types.ts';
import { extractTsTypes } from '../queries/typescript.ts';
import { extractPyTypes } from '../queries/python.ts';
import { extractGoTypes } from '../queries/go.ts';
import { extractRustTypes } from '../queries/rust.ts';
import { extractJavaTypes } from '../queries/java.ts';
import { extractCsharpTypes } from '../queries/csharp.ts';
import { extractPhpTypes } from '../queries/php.ts';
import { extractRubyTypes } from '../queries/ruby.ts';
import { extractKotlinTypes } from '../queries/kotlin.ts';

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
    case 'python':
      return extractPyTypes(tree, language, filePath);
    case 'go':
      return extractGoTypes(tree, language, filePath);
    case 'rust':
      return extractRustTypes(tree, language, filePath);
    case 'java':
      return extractJavaTypes(tree, language, filePath);
    case 'csharp':
      return extractCsharpTypes(tree, language, filePath);
    case 'php':
      return extractPhpTypes(tree, language, filePath);
    case 'ruby':
      return extractRubyTypes(tree, language, filePath);
    case 'kotlin':
      return extractKotlinTypes(tree, language, filePath);
    default:
      return [];
  }
}
