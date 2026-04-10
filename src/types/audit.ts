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

// Entry point patterns: files matching these are exempt from dead-file /
// unused-export rules. The `types(\.ts|\/)` alternation matches both the
// barrel file `types.ts` AND any file under `types/` (the per-domain type
// modules), so the whole declarative type zone is treated as an entry-
// point boundary.
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
  /(^|\/)types(\.ts|\/)/,    // types barrel or types/ directory — exempt from dead-file
];
