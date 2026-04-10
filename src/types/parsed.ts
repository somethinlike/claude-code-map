import type { SupportedLanguage } from './languages.ts';
import type { ExtractedSymbol } from './symbols.ts';
import type { ExtractedRoute } from './routes.ts';
import type { ExtractedType } from './extracted-types.ts';
import type { ExtractedImport } from './imports.ts';

export interface ParsedFile {
  readonly filePath: string;
  readonly language: SupportedLanguage;
  readonly symbols: readonly ExtractedSymbol[];
  readonly routes: readonly ExtractedRoute[];
  readonly types: readonly ExtractedType[];
  readonly imports: readonly ExtractedImport[];
}
