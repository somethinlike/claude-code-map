import type { SupportedLanguage } from './languages.ts';

export interface TypeField {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
}

export interface ExtractedType {
  readonly name: string;
  readonly kind: 'interface' | 'type' | 'enum';
  readonly fields: readonly TypeField[];
  readonly filePath: string;
  readonly line: number;
  readonly isExported: boolean;
  readonly language: SupportedLanguage;
}
