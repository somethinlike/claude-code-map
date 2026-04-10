import type { SupportedLanguage } from './languages.ts';

export interface ExtractedImport {
  readonly source: string;              // raw specifier: './utils', 'express', 'os'
  readonly resolvedPath: string | null; // project-relative path, or null if external
  readonly filePath: string;            // file this import was found in
  readonly line: number;
  readonly isExternal: boolean;
  readonly language: SupportedLanguage;
}
