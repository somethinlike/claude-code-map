// Passive code audit — structural heuristics over the indexed data.
//
// Runs a suite of rules that flag common AI-coding smells detectable from
// the export set, import graph, and file layout. Findings are ranked by
// severity × import heat so hot files surface first.

import { basename, dirname } from 'node:path';
import type {
  ParsedFile,
  ImportGraph,
  ExtractedSymbol,
  ExtractedType,
  AuditFinding,
  AuditReport,
  AuditSeverity,
  AuditRuleId,
} from './types.ts';
import { AUDIT_ENTRY_POINT_PATTERNS } from './types.ts';

// --- Config ---

const JUNK_DRAWER_PATTERN = /^(utils?|helpers?|lib|libs|misc|common|shared|stuff|etc|things)$/i;
const LEGACY_MARKER_PATTERN = /(^|_)(old|legacy|deprecated|backup|v[0-9]+)($|_)/i;
const LAYER_DATA = ['lib/', 'data/', 'db/', 'models/', 'services/'];
const LAYER_UI = ['pages/', 'app/', 'components/', 'views/', 'routes/'];
const TYPE_VARIANT_SUFFIXES = /(Data|Info|Dto|Model|Type|Entity|Record|Schema|Props|Config|Options|Payload)$/;

const SEVERITY_WEIGHT: Record<AuditSeverity, number> = {
  critical: 100,
  high: 50,
  medium: 20,
  low: 5,
};

// --- Public Entry Point ---

export interface AuditInput {
  readonly parsedFiles: Record<string, ParsedFile>;
  readonly importGraph: ImportGraph;
  readonly allSymbols: readonly ExtractedSymbol[];
  readonly allTypes: readonly ExtractedType[];
}

export function runAudit(input: AuditInput): AuditReport {
  const rules: Array<(i: AuditInput) => AuditFinding[]> = [
    detectJunkDrawers,
    detectMonoliths,
    detectCircularDependencies,
    detectLayerViolations,
    detectDuplicatedDomains,
    detectTypeSprawl,
    detectLegacyMarkers,
    detectDeadFiles,
    detectUnusedExportFiles,
    detectNamingInconsistency,
  ];

  const raw: AuditFinding[] = [];
  for (const rule of rules) {
    raw.push(...rule(input));
  }

  // Sort globally by score descending
  const findings = raw.slice().sort((a, b) => b.score - a.score);

  const bySeverity: Record<AuditSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) bySeverity[f.severity]++;

  return {
    findings,
    stats: {
      filesAnalyzed: Object.keys(input.parsedFiles).length,
      rulesRun: rules.length,
      bySeverity,
    },
  };
}

// --- Scoring ---

export function computeScore(severity: AuditSeverity, hotness: number): number {
  // Heat is a gentle multiplier — log10 keeps severity as the dominant axis
  // at reasonable hotness (0-25), and only lets a very hot finding (30+)
  // cross into an adjacent severity tier.
  //   hotness 0  → 1.00x
  //   hotness 5  → 1.78x
  //   hotness 10 → 2.04x
  //   hotness 30 → 2.49x
  //   hotness 100→ 3.00x
  const weight = SEVERITY_WEIGHT[severity];
  const heat = 1 + Math.log10(1 + Math.max(0, hotness));
  return Math.round(weight * heat);
}

function hotnessOf(graph: ImportGraph, filePath: string): number {
  return (graph.reverseAdjacency[filePath] ?? []).length;
}

function makeFinding(
  rule: AuditRuleId,
  severity: AuditSeverity,
  filePath: string,
  title: string,
  signals: string[],
  action: string,
  hotness: number,
  relatedFiles: readonly string[] = [],
): AuditFinding {
  return {
    rule,
    severity,
    filePath,
    relatedFiles,
    title,
    signals,
    action,
    hotness,
    score: computeScore(severity, hotness),
  };
}

// --- Helpers ---

function isEntryPoint(filePath: string): boolean {
  return AUDIT_ENTRY_POINT_PATTERNS.some((p) => p.test(filePath));
}

function baseNameNoExt(filePath: string): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

function exportsByFile(symbols: readonly ExtractedSymbol[]): Map<string, ExtractedSymbol[]> {
  const map = new Map<string, ExtractedSymbol[]>();
  for (const sym of symbols) {
    if (!sym.isExported) continue;
    const list = map.get(sym.filePath) ?? [];
    list.push(sym);
    map.set(sym.filePath, list);
  }
  return map;
}

function isTypeOnlyFile(symbols: readonly ExtractedSymbol[], types: readonly ExtractedType[], filePath: string): boolean {
  const fileSymbols = symbols.filter((s) => s.filePath === filePath && s.isExported);
  const fileTypes = types.filter((t) => t.filePath === filePath && t.isExported);
  if (fileTypes.length === 0) return false;
  const nonTypeKinds = fileSymbols.filter((s) => !['interface', 'type', 'enum'].includes(s.kind));
  return nonTypeKinds.length === 0;
}

// --- Rule: Junk Drawer ---

export function detectJunkDrawers(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fileExports = exportsByFile(input.allSymbols);

  for (const [filePath, exports] of fileExports) {
    const name = baseNameNoExt(filePath);
    if (!JUNK_DRAWER_PATTERN.test(name)) continue;
    if (exports.length < 5) continue; // trivial utility files are fine

    const hotness = hotnessOf(input.importGraph, filePath);
    let severity: AuditSeverity;
    if (exports.length >= 15) severity = 'critical';
    else if (exports.length >= 8) severity = 'high';
    else severity = 'medium';

    findings.push(
      makeFinding(
        'junk-drawer',
        severity,
        filePath,
        `Junk Drawer: ${basename(filePath)}`,
        [
          `Filename matches junk-drawer pattern (utils|helpers|lib|misc|common|shared)`,
          `${exports.length} exports — catch-all modules accumulate unrelated concerns`,
          hotness > 0 ? `Imported by ${hotness} file${hotness === 1 ? '' : 's'} (blast radius)` : 'Not imported anywhere',
        ],
        'Extract each domain into its own focused module (auth, format, date, etc.)',
        hotness,
      ),
    );
  }

  return findings;
}

// --- Rule: Monolith ---

export function detectMonoliths(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fileExports = exportsByFile(input.allSymbols);

  for (const [filePath, exports] of fileExports) {
    if (exports.length < 15) continue;
    // Exempt type-barrel files — `types.ts` with 30 interfaces is the norm
    if (isTypeOnlyFile(input.allSymbols, input.allTypes, filePath)) continue;
    // Exempt files already flagged as junk drawers (same remedy, different framing)
    if (JUNK_DRAWER_PATTERN.test(baseNameNoExt(filePath))) continue;

    const hotness = hotnessOf(input.importGraph, filePath);
    const severity: AuditSeverity = exports.length >= 25 ? 'critical' : 'high';

    findings.push(
      makeFinding(
        'monolith',
        severity,
        filePath,
        `Monolith: ${basename(filePath)}`,
        [
          `${exports.length} top-level exports in one file`,
          hotness > 0 ? `Imported by ${hotness} file${hotness === 1 ? '' : 's'}` : 'Not imported anywhere',
        ],
        'Decompose by concern; single-file modules over 15 exports usually span multiple domains',
        hotness,
      ),
    );
  }

  return findings;
}

// --- Rule: Circular Dependencies (Tarjan's SCC) ---

export function detectCircularDependencies(input: AuditInput): AuditFinding[] {
  const { adjacency } = input.importGraph;
  const nodes = Object.keys(adjacency);

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency[v] ?? []) {
      if (!index.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) sccs.push(component);
    }
  }

  for (const v of nodes) {
    if (!index.has(v)) strongConnect(v);
  }

  const findings: AuditFinding[] = [];
  for (const scc of sccs) {
    // Primary file = the hottest one in the cycle
    const sorted = scc.slice().sort((a, b) => hotnessOf(input.importGraph, b) - hotnessOf(input.importGraph, a));
    const primary = sorted[0];
    const hotness = hotnessOf(input.importGraph, primary);

    findings.push(
      makeFinding(
        'circular-dependency',
        'critical',
        primary,
        `Circular Dependency (${scc.length} files)`,
        [
          `Cycle: ${sorted.join(' → ')} → ${sorted[0]}`,
          `Circular imports cause initialization-order bugs and prevent clean extraction`,
        ],
        'Break the cycle by extracting shared types/constants into a third module',
        hotness,
        sorted.slice(1),
      ),
    );
  }

  return findings;
}

// --- Rule: Layer Violations ---

export function detectLayerViolations(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const edge of input.importGraph.edges) {
    const from = edge.from;
    const to = edge.to;

    const fromIsData = LAYER_DATA.some((p) => from.includes(p));
    const toIsUi = LAYER_UI.some((p) => to.includes(p));

    if (fromIsData && toIsUi) {
      const hotness = hotnessOf(input.importGraph, from);
      findings.push(
        makeFinding(
          'layer-violation',
          'high',
          from,
          `Layer Violation: data layer imports UI`,
          [
            `${from} imports ${to}`,
            `Data/service layers should not depend on UI — breaks reusability and causes circular risk`,
          ],
          'Invert the dependency: the UI layer should import from lib/data, not the other way around',
          hotness,
          [to],
        ),
      );
    }
  }

  return findings;
}

// --- Rule: Duplicated Domain (same export name in multiple files) ---

export function detectDuplicatedDomains(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Group exported symbols by name
  const byName = new Map<string, ExtractedSymbol[]>();
  for (const sym of input.allSymbols) {
    if (!sym.isExported) continue;
    // Skip extremely common names that aren't meaningful duplicates
    if (['default', 'index', 'main', 'run', 'init', 'get', 'set', 'toString'].includes(sym.name)) continue;
    // Skip framework conventions (Next.js, Astro)
    if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'loader', 'action', 'meta', 'handler', 'config'].includes(sym.name)) continue;
    const list = byName.get(sym.name) ?? [];
    list.push(sym);
    byName.set(sym.name, list);
  }

  for (const [name, syms] of byName) {
    if (syms.length < 2) continue;
    // Skip collisions across language boundaries (real duplicates usually share a language)
    const langs = new Set(syms.map((s) => s.language));
    if (langs.size > 1) continue;
    // Skip trivial: same name in the same file (overloads etc)
    const files = [...new Set(syms.map((s) => s.filePath))];
    if (files.length < 2) continue;

    // Pick primary = hottest file
    const sorted = files.slice().sort((a, b) => hotnessOf(input.importGraph, b) - hotnessOf(input.importGraph, a));
    const primary = sorted[0];
    const hotness = hotnessOf(input.importGraph, primary);

    findings.push(
      makeFinding(
        'duplicated-domain',
        'high',
        primary,
        `Duplicated symbol: \`${name}\` in ${files.length} files`,
        [
          `Files: ${files.join(', ')}`,
          `Same-named exports across files usually indicate a partial refactor or parallel implementations`,
        ],
        'Consolidate into one canonical definition and re-import from the others',
        hotness,
        sorted.slice(1),
      ),
    );
  }

  return findings;
}

// --- Rule: Type Sprawl ---

export function detectTypeSprawl(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Group types by normalized root name
  const byRoot = new Map<string, ExtractedType[]>();
  for (const t of input.allTypes) {
    if (!t.isExported) continue;
    let root = t.name.replace(/^I(?=[A-Z])/, ''); // strip leading I from IFoo
    root = root.replace(TYPE_VARIANT_SUFFIXES, '');
    if (root.length < 3) continue; // skip single-letter roots like "T", "K"
    const list = byRoot.get(root) ?? [];
    list.push(t);
    byRoot.set(root, list);
  }

  for (const [root, variants] of byRoot) {
    // Deduplicate on name — same type in multiple files is handled by duplicated-domain
    const uniqueNames = [...new Set(variants.map((v) => v.name))];
    if (uniqueNames.length < 3) continue;

    const files = [...new Set(variants.map((v) => v.filePath))];
    const sorted = files.slice().sort((a, b) => hotnessOf(input.importGraph, b) - hotnessOf(input.importGraph, a));
    const primary = sorted[0];
    const hotness = hotnessOf(input.importGraph, primary);

    findings.push(
      makeFinding(
        'type-sprawl',
        'high',
        primary,
        `Type Sprawl: \`${root}\` has ${uniqueNames.length} variants`,
        [
          `Variants: ${uniqueNames.join(', ')}`,
          `${files.length} file${files.length === 1 ? '' : 's'} involved`,
          `Multiple shape-types sharing a root name typically indicate AI-generated near-duplicates`,
        ],
        `Pick one canonical shape for \`${root}\`; delete or narrow the variants to nominal aliases`,
        hotness,
        sorted.slice(1),
      ),
    );
  }

  return findings;
}

// --- Rule: Legacy Markers ---

export function detectLegacyMarkers(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Check file paths
  for (const filePath of Object.keys(input.parsedFiles)) {
    const name = baseNameNoExt(filePath);
    if (LEGACY_MARKER_PATTERN.test(name) || LEGACY_MARKER_PATTERN.test(dirname(filePath))) {
      const hotness = hotnessOf(input.importGraph, filePath);
      findings.push(
        makeFinding(
          'legacy-marker',
          'high',
          filePath,
          `Legacy Marker: ${basename(filePath)}`,
          [
            `File path matches legacy pattern (_old|_legacy|_v1|_v2|_deprecated|_backup)`,
            hotness > 0 ? `Still imported by ${hotness} file${hotness === 1 ? '' : 's'} — refactor is incomplete` : 'No importers — safe to delete?',
          ],
          hotness > 0 ? 'Complete the refactor: migrate consumers and delete the legacy file' : 'Delete if truly unused',
          hotness,
        ),
      );
    }
  }

  // Check export names
  const byFile = new Map<string, ExtractedSymbol[]>();
  for (const sym of input.allSymbols) {
    if (!sym.isExported) continue;
    if (!LEGACY_MARKER_PATTERN.test(sym.name)) continue;
    const list = byFile.get(sym.filePath) ?? [];
    list.push(sym);
    byFile.set(sym.filePath, list);
  }

  for (const [filePath, syms] of byFile) {
    // Skip if the whole file is already flagged
    if (LEGACY_MARKER_PATTERN.test(baseNameNoExt(filePath))) continue;
    const hotness = hotnessOf(input.importGraph, filePath);
    findings.push(
      makeFinding(
        'legacy-marker',
        'high',
        filePath,
        `Legacy exports in ${basename(filePath)}`,
        [
          `${syms.length} export${syms.length === 1 ? '' : 's'} match legacy pattern: ${syms.map((s) => s.name).join(', ')}`,
          `Legacy-marked exports usually signal incomplete refactors`,
        ],
        'Audit callers and remove the legacy exports once migration is complete',
        hotness,
      ),
    );
  }

  return findings;
}

// --- Rule: Dead Files ---

export function detectDeadFiles(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const { adjacency, reverseAdjacency } = input.importGraph;

  for (const filePath of Object.keys(input.parsedFiles)) {
    if (isEntryPoint(filePath)) continue;
    const inEdges = (reverseAdjacency[filePath] ?? []).length;
    const outEdges = (adjacency[filePath] ?? []).length;
    if (inEdges === 0 && outEdges === 0) {
      findings.push(
        makeFinding(
          'dead-file',
          'medium',
          filePath,
          `Dead File: ${basename(filePath)}`,
          [
            `Zero imports in, zero imports out`,
            `Not recognized as an entry point (cli, main, index, config, etc.)`,
          ],
          'Verify it is actually used (dynamic import, CLI script, test fixture); if not, delete',
          0,
        ),
      );
    }
  }

  return findings;
}

// --- Rule: Unused Export Files ---

export function detectUnusedExportFiles(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const { reverseAdjacency } = input.importGraph;
  const fileExports = exportsByFile(input.allSymbols);

  for (const [filePath, exports] of fileExports) {
    if (exports.length === 0) continue;
    if (isEntryPoint(filePath)) continue;
    const inEdges = (reverseAdjacency[filePath] ?? []).length;
    if (inEdges > 0) continue;

    // Exempt dead files — already reported by detectDeadFiles
    const outEdges = (input.importGraph.adjacency[filePath] ?? []).length;
    if (outEdges === 0) continue;

    findings.push(
      makeFinding(
        'unused-export',
        'medium',
        filePath,
        `Unused Exports: ${basename(filePath)}`,
        [
          `File exports ${exports.length} symbol${exports.length === 1 ? '' : 's'} but nothing imports this file`,
          `Imports ${outEdges} other file${outEdges === 1 ? '' : 's'} — likely orphaned code, not an entry point`,
        ],
        'Either wire this file into the import graph or delete it',
        0,
      ),
    );
  }

  return findings;
}

// --- Rule: Naming Inconsistency ---

export function detectNamingInconsistency(input: AuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fileExports = exportsByFile(input.allSymbols);

  for (const [filePath, exports] of fileExports) {
    if (exports.length < 4) continue;

    let camelCount = 0;
    let snakeCount = 0;
    const camelExamples: string[] = [];
    const snakeExamples: string[] = [];

    for (const sym of exports) {
      // Skip constants (UPPER_SNAKE) and classes (PascalCase)
      if (/^[A-Z][A-Z0-9_]*$/.test(sym.name)) continue;
      if (/^[A-Z][a-zA-Z0-9]*$/.test(sym.name)) continue;

      if (/_/.test(sym.name) && /^[a-z]/.test(sym.name)) {
        snakeCount++;
        if (snakeExamples.length < 3) snakeExamples.push(sym.name);
      } else if (/^[a-z][a-zA-Z0-9]*$/.test(sym.name) && /[A-Z]/.test(sym.name)) {
        camelCount++;
        if (camelExamples.length < 3) camelExamples.push(sym.name);
      }
    }

    if (camelCount >= 2 && snakeCount >= 2) {
      const hotness = hotnessOf(input.importGraph, filePath);
      findings.push(
        makeFinding(
          'naming-inconsistency',
          'low',
          filePath,
          `Mixed naming: ${basename(filePath)}`,
          [
            `${camelCount} camelCase exports (${camelExamples.join(', ')}...)`,
            `${snakeCount} snake_case exports (${snakeExamples.join(', ')}...)`,
            `Mixed conventions in one file typically indicate AI-merged code from different sources`,
          ],
          'Pick one convention for this file and rename the minority',
          hotness,
        ),
      );
    }
  }

  return findings;
}
