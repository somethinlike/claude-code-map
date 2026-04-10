import type { SupportedLanguage } from './languages.ts';

export interface ScannedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly language: SupportedLanguage;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface FileNode {
  readonly name: string;
  readonly relativePath: string;
  readonly isDirectory: boolean;
  readonly children: FileNode[];
  readonly annotation?: string;
  readonly language?: SupportedLanguage;
}
