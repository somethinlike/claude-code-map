import type { SupportedLanguage } from './languages.ts';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'variable'
  | 'method';

export interface ExtractedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly signature: string;
  readonly filePath: string;
  readonly line: number;
  readonly isExported: boolean;
  readonly isDefault: boolean;
  readonly language: SupportedLanguage;
}
