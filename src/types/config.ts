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
