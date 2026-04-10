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

// tree-sitter-wasms ships grammar files with these names
export const WASM_FILE_MAP: Record<SupportedLanguage, string> = {
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

// Languages that share a grammar (queries must account for this)
export const GRAMMAR_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  typescript: 'typescript',
  javascript: 'javascript',
  tsx: 'tsx',
  jsx: 'javascript',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  kotlin: 'kotlin',
};

// --- Extracted Data ---

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

export interface ExtractedRoute {
  readonly method: string; // GET, POST, PUT, PATCH, DELETE, ALL, USE
  readonly path: string;
  readonly filePath: string;
  readonly line: number;
  readonly handler: string;
  readonly auth: boolean;
  readonly framework: string;
}

export interface SchemaField {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly isRelation: boolean;
  readonly attributes: readonly string[]; // PK, UQ, FK, etc.
}

export interface ExtractedModel {
  readonly name: string;
  readonly fields: readonly SchemaField[];
  readonly filePath: string;
  readonly orm: string; // prisma, django, sqlalchemy, drizzle, etc.
}

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

// --- Framework Detection ---

export type FrameworkId =
  | 'nextjs-app'
  | 'nextjs-pages'
  | 'nextjs-both'
  | 'astro'
  | 'express'
  | 'fastify'
  | 'django'
  | 'flask'
  | 'generic';

export interface DetectedFramework {
  readonly id: FrameworkId;
  readonly name: string;
  readonly entryPoints: readonly string[];
  readonly routePatterns: readonly string[];
}

// --- File Scanning ---

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

// --- Import Extraction ---

export interface ExtractedImport {
  readonly source: string;              // raw specifier: './utils', 'express', 'os'
  readonly resolvedPath: string | null; // project-relative path, or null if external
  readonly filePath: string;            // file this import was found in
  readonly line: number;
  readonly isExternal: boolean;
  readonly language: SupportedLanguage;
}

// --- Import Graph ---

export interface ImportEdge {
  readonly from: string; // relative path of importing file
  readonly to: string;   // relative path of imported file
}

export interface ImportGraph {
  readonly edges: readonly ImportEdge[];
  readonly adjacency: Record<string, readonly string[]>;        // file → what it imports
  readonly reverseAdjacency: Record<string, readonly string[]>; // file → what imports it
  readonly hotFiles: readonly HotFile[];
}

export interface HotFile {
  readonly filePath: string;
  readonly importedBy: number; // in-degree
  readonly imports: number;    // out-degree
}

export interface BlastRadius {
  readonly targetFile: string;
  readonly affectedFiles: readonly string[];
  readonly depth: number;
  readonly affectedRoutes: readonly string[];
  readonly affectedModels: readonly string[];
}

// --- Parsed Results ---

export interface ParsedFile {
  readonly filePath: string;
  readonly language: SupportedLanguage;
  readonly symbols: readonly ExtractedSymbol[];
  readonly routes: readonly ExtractedRoute[];
  readonly types: readonly ExtractedType[];
  readonly imports: readonly ExtractedImport[];
}

// --- Audit ---

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AuditRuleId =
  | 'junk-drawer'
  | 'monolith'
  | 'circular-dependency'
  | 'layer-violation'
  | 'duplicated-domain'
  | 'type-sprawl'
  | 'legacy-marker'
  | 'unused-export'
  | 'dead-file'
  | 'naming-inconsistency';

export interface AuditFinding {
  readonly rule: AuditRuleId;
  readonly severity: AuditSeverity;
  readonly filePath: string;          // primary file (or first file in a multi-file finding)
  readonly relatedFiles: readonly string[]; // extra files for cross-file findings (e.g., cycles)
  readonly title: string;
  readonly signals: readonly string[];
  readonly action: string;
  readonly hotness: number;           // incoming import count for primary file
  readonly score: number;             // severity weight × heat multiplier
}

export interface AuditReport {
  readonly findings: readonly AuditFinding[];
  readonly stats: {
    readonly filesAnalyzed: number;
    readonly rulesRun: number;
    readonly bySeverity: Record<AuditSeverity, number>;
  };
}

// Entry point patterns: files matching these are exempt from dead-file / unused-export rules.
// Stored as string patterns (not RegExp) so the constant is serializable.
export const AUDIT_ENTRY_POINT_PATTERNS: readonly RegExp[] = [
  /(^|\/)cli\.(ts|js|mjs|cjs|py)$/,
  /(^|\/)main\.(ts|js|mjs|cjs|py|go|rs|java|kt)$/,
  /(^|\/)index\.(ts|js|mjs|cjs)$/,
  /(^|\/)__main__\.py$/,
  /(^|\/)app\.(ts|js|mjs|py)$/,
  /(^|\/)server\.(ts|js|mjs|py|go)$/,
  /(^|\/)bin\//,
  /\.config\.(ts|js|mjs|cjs)$/,
  /(^|\/)(vite|webpack|rollup|esbuild|next|astro|svelte|nuxt|tailwind|postcss)\.config\./,
  /(^|\/)tsconfig\./,
  /(^|\/)types\.(ts|d\.ts)$/,    // types barrel — exempt from dead-file
];

// --- Cache ---

export interface CacheEntry {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly size: number;
}

export interface CacheManifest {
  readonly version: number;
  readonly generatedAt: string;
  readonly files: Record<string, CacheEntry>;
}

// --- Config ---

export interface CodemapConfig {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly output: string;
  readonly schema: readonly string[];
}

export const DEFAULT_EXCLUDE = [
  'node_modules',
  '.next',
  '.git',
  '.worktrees',
  '__pycache__',
  '.turbo',
  'dist',
  'build',
  '.cache',
  'coverage',
  '.nyc_output',
  '.parcel-cache',
  '.codemap',
  '.claude',
  'target',        // Rust
  'vendor',        // Go
  'bin',           // Java/C# output
  'obj',           // C# output
  '.venv',
  'venv',
  'env',
] as const;

export const DEFAULT_SKIP_PATTERNS = [
  '.d.ts',
  '.map',
  '.min.js',
  '.min.css',
  '.backup.',
  '-backup-',
  '.test.',
  '.spec.',
  '.stories.',
  '__test__',
  '__tests__',
  '__mocks__',
] as const;

export const DEFAULT_CONFIG: CodemapConfig = {
  include: [],
  exclude: [],
  output: '.codemap',
  schema: [],
};

export const AUDIT_SKIP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'isDeleted',
  'created_at',
  'updated_at',
  'deleted_at',
  'is_deleted',
]);
