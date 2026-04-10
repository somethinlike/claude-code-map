import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { WASM_FILE_MAP } from './types.ts';
import type { SupportedLanguage } from './types.ts';

// web-tree-sitter types
type Parser = any;
type Language = any;
type Tree = any;
type Query = any;

let ParserClass: any = null;
const languageCache = new Map<string, Language>();

function findPackageDir(packageName: string): string {
  // Walk up from this file's directory to find node_modules/<package>
  let dir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  while (dir.length > 3) {
    const candidate = join(dir, 'node_modules', packageName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot find package: ${packageName}`);
}

function resolveWasmPath(wasmFileName: string): string {
  const packageDir = findPackageDir('tree-sitter-wasms');
  // WASM files live in the 'out' subdirectory
  const outPath = join(packageDir, 'out', wasmFileName);
  if (existsSync(outPath)) return outPath;
  // Fallback to package root
  return join(packageDir, wasmFileName);
}

function resolveParserWasm(): string {
  const packageDir = findPackageDir('web-tree-sitter');
  return join(packageDir, 'tree-sitter.wasm');
}

export async function initParser(): Promise<void> {
  if (ParserClass) return;

  const mod = await import('web-tree-sitter');
  const TreeSitterParser = mod.Parser;
  const parserWasmPath = resolveParserWasm();

  await TreeSitterParser.init({
    locateFile: () => parserWasmPath,
  });

  ParserClass = TreeSitterParser;
}

let LanguageClass: any = null;

async function ensureLanguageClass(): Promise<void> {
  if (LanguageClass) return;
  const mod = await import('web-tree-sitter');
  LanguageClass = mod.Language;
}

async function loadLanguage(language: SupportedLanguage): Promise<Language> {
  const wasmFile = WASM_FILE_MAP[language];
  if (!wasmFile) {
    throw new Error(`No tree-sitter grammar registered for language: ${language}`);
  }
  if (languageCache.has(wasmFile)) {
    return languageCache.get(wasmFile)!;
  }

  await ensureLanguageClass();
  const wasmPath = resolveWasmPath(wasmFile);
  const lang = await LanguageClass.load(wasmPath);
  languageCache.set(wasmFile, lang);
  return lang;
}

export async function parseFile(filePath: string, language: SupportedLanguage): Promise<Tree | null> {
  if (!ParserClass) throw new Error('Parser not initialized. Call initParser() first.');

  const lang = await loadLanguage(language);
  const parser = new ParserClass();
  parser.setLanguage(lang);

  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const tree = parser.parse(source);
  return tree;
}

export async function getLanguage(language: SupportedLanguage): Promise<Language> {
  return loadLanguage(language);
}

export interface QueryCapture {
  readonly name: string;
  readonly text: string;
  readonly startRow: number;
  readonly startColumn: number;
  readonly type: string;
}

export async function runQuery(
  language: SupportedLanguage,
  tree: Tree,
  queryString: string,
): Promise<QueryCapture[]> {
  const lang = await loadLanguage(language);
  let query: Query;

  try {
    const mod = await import('web-tree-sitter');
    const QueryClass = mod.Query;
    query = new QueryClass(lang, queryString);
  } catch (err) {
    console.error(`[codemap] Query error for ${language}: ${err}`);
    return [];
  }

  const captures = query.captures(tree.rootNode);
  return captures.map((c: any) => ({
    name: c.name,
    text: c.node.text,
    startRow: c.node.startPosition.row,
    startColumn: c.node.startPosition.column,
    type: c.node.type,
  }));
}
