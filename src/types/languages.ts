// --- Language Support ---

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'kotlin'
  | 'astro';

export const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.js': 'javascript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.astro': 'astro',
};

// tree-sitter-wasms ships grammar files with these names.
// Partial<Record<...>> because astro has no tree-sitter grammar (uses
// regex frontmatter extraction in queries/astro.ts and is routed through
// a separate code path in cli.ts before reaching the parser).
export const WASM_FILE_MAP: Partial<Record<SupportedLanguage, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  jsx: 'tree-sitter-javascript.wasm', // JSX uses the JS grammar
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
  csharp: 'tree-sitter-c_sharp.wasm',
  php: 'tree-sitter-php.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  kotlin: 'tree-sitter-kotlin.wasm',
};
