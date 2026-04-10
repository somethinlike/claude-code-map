import { describe, it, expect } from 'vitest';
import {
  runAudit,
  computeScore,
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
} from './audit.ts';
import type {
  ParsedFile,
  ImportGraph,
  ExtractedSymbol,
  ExtractedType,
  SymbolKind,
} from './types.ts';

// --- Test Fixtures ---

function makeSymbol(
  name: string,
  filePath: string,
  kind: SymbolKind = 'function',
  isExported = true,
): ExtractedSymbol {
  return {
    name,
    kind,
    signature: `${name}()`,
    filePath,
    line: 1,
    isExported,
    isDefault: false,
    language: 'typescript',
  };
}

function makeType(
  name: string,
  filePath: string,
  kind: 'interface' | 'type' | 'enum' = 'interface',
  isExported = true,
): ExtractedType {
  return {
    name,
    kind,
    fields: [],
    filePath,
    line: 1,
    isExported,
    language: 'typescript',
  };
}

function makeParsedFile(filePath: string): ParsedFile {
  return {
    filePath,
    language: 'typescript',
    symbols: [],
    routes: [],
    types: [],
    imports: [],
  };
}

function makeGraph(edges: Array<[string, string]>): ImportGraph {
  const adjacency: Record<string, string[]> = {};
  const reverseAdjacency: Record<string, string[]> = {};
  for (const [from, to] of edges) {
    (adjacency[from] ??= []).push(to);
    (reverseAdjacency[to] ??= []).push(from);
    adjacency[to] ??= [];
    reverseAdjacency[from] ??= [];
  }
  return {
    edges: edges.map(([from, to]) => ({ from, to })),
    adjacency,
    reverseAdjacency,
    hotFiles: [],
  };
}

function makeInput(
  parsedFiles: Record<string, ParsedFile>,
  graph: ImportGraph,
  symbols: ExtractedSymbol[] = [],
  types: ExtractedType[] = [],
) {
  return {
    parsedFiles,
    importGraph: graph,
    allSymbols: symbols,
    allTypes: types,
  };
}

// --- Scoring ---

describe('computeScore', () => {
  it('weights critical higher than high', () => {
    expect(computeScore('critical', 0)).toBeGreaterThan(computeScore('high', 0));
  });

  it('weights high higher than medium', () => {
    expect(computeScore('high', 0)).toBeGreaterThan(computeScore('medium', 0));
  });

  it('scales with hotness', () => {
    expect(computeScore('high', 10)).toBeGreaterThan(computeScore('high', 0));
  });

  it('severity dominates at low hotness (same or cold files)', () => {
    // When hotness is equal, severity is the only thing that matters.
    expect(computeScore('critical', 5)).toBeGreaterThan(computeScore('high', 5));
    expect(computeScore('high', 5)).toBeGreaterThan(computeScore('medium', 5));
    expect(computeScore('medium', 5)).toBeGreaterThan(computeScore('low', 5));
    // A cold high still beats a cold medium regardless of close-in hotness.
    expect(computeScore('high', 0)).toBeGreaterThan(computeScore('medium', 2));
  });

  it('heat can promote a finding across tiers at high hotness — by design', () => {
    // The point of heat-weighting: a medium finding in a file imported by
    // many others has more blast radius than a high finding in a cold file.
    // This crossover is intentional and signals "look here first".
    expect(computeScore('medium', 50)).toBeGreaterThan(computeScore('high', 0));
  });
});

// --- Junk Drawer ---

describe('detectJunkDrawers', () => {
  it('flags utils.ts with many exports', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 10; i++) {
      symbols.push(makeSymbol(`util${i}`, 'src/utils.ts'));
    }
    const input = makeInput(
      { 'src/utils.ts': makeParsedFile('src/utils.ts') },
      makeGraph([]),
      symbols,
    );
    const findings = detectJunkDrawers(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('junk-drawer');
    expect(findings[0].severity).toBe('high');
  });

  it('does not flag utils.ts with only 2 exports', () => {
    const symbols = [
      makeSymbol('truncate', 'src/utils.ts'),
      makeSymbol('groupBy', 'src/utils.ts'),
    ];
    const input = makeInput(
      { 'src/utils.ts': makeParsedFile('src/utils.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectJunkDrawers(input)).toHaveLength(0);
  });

  it('escalates to critical at 15+ exports', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 18; i++) {
      symbols.push(makeSymbol(`h${i}`, 'src/helpers.ts'));
    }
    const input = makeInput(
      { 'src/helpers.ts': makeParsedFile('src/helpers.ts') },
      makeGraph([]),
      symbols,
    );
    const findings = detectJunkDrawers(input);
    expect(findings[0].severity).toBe('critical');
  });

  it('does not flag non-junk names like auth.ts', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 10; i++) {
      symbols.push(makeSymbol(`fn${i}`, 'src/auth.ts'));
    }
    const input = makeInput(
      { 'src/auth.ts': makeParsedFile('src/auth.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectJunkDrawers(input)).toHaveLength(0);
  });
});

// --- Monolith ---

describe('detectMonoliths', () => {
  it('flags files with 15+ exports', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 16; i++) {
      symbols.push(makeSymbol(`fn${i}`, 'src/Dashboard.tsx'));
    }
    const input = makeInput(
      { 'src/Dashboard.tsx': makeParsedFile('src/Dashboard.tsx') },
      makeGraph([]),
      symbols,
    );
    const findings = detectMonoliths(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('escalates to critical at 25+ exports', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 30; i++) {
      symbols.push(makeSymbol(`fn${i}`, 'src/God.ts'));
    }
    const input = makeInput(
      { 'src/God.ts': makeParsedFile('src/God.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectMonoliths(input)[0].severity).toBe('critical');
  });

  it('exempts type-only files (types.ts with 30 interfaces is fine)', () => {
    const symbols: ExtractedSymbol[] = [];
    const types: ExtractedType[] = [];
    for (let i = 0; i < 20; i++) {
      symbols.push(makeSymbol(`Iface${i}`, 'src/types.ts', 'interface'));
      types.push(makeType(`Iface${i}`, 'src/types.ts'));
    }
    const input = makeInput(
      { 'src/types.ts': makeParsedFile('src/types.ts') },
      makeGraph([]),
      symbols,
      types,
    );
    expect(detectMonoliths(input)).toHaveLength(0);
  });

  it('does not double-flag junk drawers as monoliths', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 20; i++) {
      symbols.push(makeSymbol(`h${i}`, 'src/utils.ts'));
    }
    const input = makeInput(
      { 'src/utils.ts': makeParsedFile('src/utils.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectMonoliths(input)).toHaveLength(0);
  });
});

// --- Circular Dependencies ---

describe('detectCircularDependencies', () => {
  it('detects a 2-file cycle', () => {
    const graph = makeGraph([
      ['src/a.ts', 'src/b.ts'],
      ['src/b.ts', 'src/a.ts'],
    ]);
    const input = makeInput(
      {
        'src/a.ts': makeParsedFile('src/a.ts'),
        'src/b.ts': makeParsedFile('src/b.ts'),
      },
      graph,
    );
    const findings = detectCircularDependencies(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('detects a 3-file cycle', () => {
    const graph = makeGraph([
      ['src/a.ts', 'src/b.ts'],
      ['src/b.ts', 'src/c.ts'],
      ['src/c.ts', 'src/a.ts'],
    ]);
    const input = makeInput(
      {
        'src/a.ts': makeParsedFile('src/a.ts'),
        'src/b.ts': makeParsedFile('src/b.ts'),
        'src/c.ts': makeParsedFile('src/c.ts'),
      },
      graph,
    );
    const findings = detectCircularDependencies(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedFiles).toHaveLength(2);
  });

  it('does not flag acyclic graphs', () => {
    const graph = makeGraph([
      ['src/a.ts', 'src/b.ts'],
      ['src/b.ts', 'src/c.ts'],
    ]);
    const input = makeInput(
      {
        'src/a.ts': makeParsedFile('src/a.ts'),
        'src/b.ts': makeParsedFile('src/b.ts'),
        'src/c.ts': makeParsedFile('src/c.ts'),
      },
      graph,
    );
    expect(detectCircularDependencies(input)).toHaveLength(0);
  });
});

// --- Layer Violations ---

describe('detectLayerViolations', () => {
  it('flags lib importing from pages', () => {
    const graph = makeGraph([['src/lib/helper.ts', 'src/pages/home.tsx']]);
    const input = makeInput(
      {
        'src/lib/helper.ts': makeParsedFile('src/lib/helper.ts'),
        'src/pages/home.tsx': makeParsedFile('src/pages/home.tsx'),
      },
      graph,
    );
    const findings = detectLayerViolations(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('allows pages importing from lib (correct direction)', () => {
    const graph = makeGraph([['src/pages/home.tsx', 'src/lib/helper.ts']]);
    const input = makeInput(
      {
        'src/pages/home.tsx': makeParsedFile('src/pages/home.tsx'),
        'src/lib/helper.ts': makeParsedFile('src/lib/helper.ts'),
      },
      graph,
    );
    expect(detectLayerViolations(input)).toHaveLength(0);
  });
});

// --- Duplicated Domains ---

describe('detectDuplicatedDomains', () => {
  it('flags same export name in multiple files', () => {
    const symbols = [
      makeSymbol('validateSession', 'src/auth.ts'),
      makeSymbol('validateSession', 'src/authentication.ts'),
    ];
    const input = makeInput(
      {
        'src/auth.ts': makeParsedFile('src/auth.ts'),
        'src/authentication.ts': makeParsedFile('src/authentication.ts'),
      },
      makeGraph([]),
      symbols,
    );
    const findings = detectDuplicatedDomains(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('validateSession');
  });

  it('ignores framework conventions like GET/POST', () => {
    const symbols = [
      makeSymbol('GET', 'src/api/users.ts'),
      makeSymbol('GET', 'src/api/posts.ts'),
    ];
    const input = makeInput({}, makeGraph([]), symbols);
    expect(detectDuplicatedDomains(input)).toHaveLength(0);
  });

  it('ignores common generics like init/run/get/set', () => {
    const symbols = [
      makeSymbol('init', 'src/a.ts'),
      makeSymbol('init', 'src/b.ts'),
    ];
    const input = makeInput({}, makeGraph([]), symbols);
    expect(detectDuplicatedDomains(input)).toHaveLength(0);
  });
});

// --- Type Sprawl ---

describe('detectTypeSprawl', () => {
  it('flags 3+ variants of the same root type', () => {
    const types = [
      makeType('User', 'src/types.ts'),
      makeType('UserData', 'src/types.ts'),
      makeType('UserInfo', 'src/types.ts'),
      makeType('UserDto', 'src/api.ts'),
    ];
    const input = makeInput({}, makeGraph([]), [], types);
    const findings = detectTypeSprawl(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('User');
  });

  it('strips leading I from IFoo when computing root', () => {
    const types = [
      makeType('IUser', 'src/types.ts'),
      makeType('User', 'src/types.ts'),
      makeType('UserData', 'src/types.ts'),
    ];
    const input = makeInput({}, makeGraph([]), [], types);
    expect(detectTypeSprawl(input)).toHaveLength(1);
  });

  it('does not flag 2 variants', () => {
    const types = [
      makeType('User', 'src/types.ts'),
      makeType('UserData', 'src/types.ts'),
    ];
    const input = makeInput({}, makeGraph([]), [], types);
    expect(detectTypeSprawl(input)).toHaveLength(0);
  });
});

// --- Legacy Markers ---

describe('detectLegacyMarkers', () => {
  it('flags files with _old suffix', () => {
    const input = makeInput(
      { 'src/auth_old.ts': makeParsedFile('src/auth_old.ts') },
      makeGraph([]),
    );
    const findings = detectLegacyMarkers(input);
    expect(findings).toHaveLength(1);
  });

  it('flags files with _v1 in the name', () => {
    const input = makeInput(
      { 'src/parser_v1.ts': makeParsedFile('src/parser_v1.ts') },
      makeGraph([]),
    );
    expect(detectLegacyMarkers(input)).toHaveLength(1);
  });

  it('flags legacy exports in otherwise-clean files', () => {
    const symbols = [makeSymbol('parseOld_v1', 'src/parser.ts')];
    const input = makeInput(
      { 'src/parser.ts': makeParsedFile('src/parser.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectLegacyMarkers(input)).toHaveLength(1);
  });
});

// --- Dead Files ---

describe('detectDeadFiles', () => {
  it('flags files with zero edges', () => {
    const input = makeInput(
      { 'src/orphan.ts': makeParsedFile('src/orphan.ts') },
      makeGraph([]),
    );
    const findings = detectDeadFiles(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('exempts cli.ts entry point', () => {
    const input = makeInput(
      { 'src/cli.ts': makeParsedFile('src/cli.ts') },
      makeGraph([]),
    );
    expect(detectDeadFiles(input)).toHaveLength(0);
  });

  it('exempts config files', () => {
    const input = makeInput(
      { 'vite.config.ts': makeParsedFile('vite.config.ts') },
      makeGraph([]),
    );
    expect(detectDeadFiles(input)).toHaveLength(0);
  });

  it('does not flag files with outgoing imports', () => {
    const input = makeInput(
      {
        'src/a.ts': makeParsedFile('src/a.ts'),
        'src/b.ts': makeParsedFile('src/b.ts'),
      },
      makeGraph([['src/a.ts', 'src/b.ts']]),
    );
    // a.ts has out-edges → not dead. b.ts has in-edges → not dead.
    expect(detectDeadFiles(input)).toHaveLength(0);
  });
});

// --- Unused Exports ---

describe('detectUnusedExportFiles', () => {
  it('flags files exporting but never imported', () => {
    const symbols = [makeSymbol('orphanFn', 'src/orphan.ts')];
    const input = makeInput(
      {
        'src/orphan.ts': makeParsedFile('src/orphan.ts'),
        'src/dep.ts': makeParsedFile('src/dep.ts'),
      },
      makeGraph([['src/orphan.ts', 'src/dep.ts']]),
      symbols,
    );
    const findings = detectUnusedExportFiles(input);
    expect(findings).toHaveLength(1);
  });

  it('exempts entry points', () => {
    const symbols = [makeSymbol('main', 'src/cli.ts')];
    const input = makeInput(
      {
        'src/cli.ts': makeParsedFile('src/cli.ts'),
        'src/dep.ts': makeParsedFile('src/dep.ts'),
      },
      makeGraph([['src/cli.ts', 'src/dep.ts']]),
      symbols,
    );
    expect(detectUnusedExportFiles(input)).toHaveLength(0);
  });

  it('does not double-flag dead files', () => {
    // A file with 0 in and 0 out should be handled by detectDeadFiles, not this rule.
    const symbols = [makeSymbol('orphan', 'src/orphan.ts')];
    const input = makeInput(
      { 'src/orphan.ts': makeParsedFile('src/orphan.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectUnusedExportFiles(input)).toHaveLength(0);
  });
});

// --- Naming Inconsistency ---

describe('detectNamingInconsistency', () => {
  it('flags files mixing camelCase and snake_case', () => {
    const symbols = [
      makeSymbol('getUserData', 'src/mixed.ts'),
      makeSymbol('fetchPosts', 'src/mixed.ts'),
      makeSymbol('get_user_data', 'src/mixed.ts'),
      makeSymbol('fetch_posts', 'src/mixed.ts'),
    ];
    const input = makeInput(
      { 'src/mixed.ts': makeParsedFile('src/mixed.ts') },
      makeGraph([]),
      symbols,
    );
    const findings = detectNamingInconsistency(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
  });

  it('does not flag consistent camelCase files', () => {
    const symbols = [
      makeSymbol('getUserData', 'src/clean.ts'),
      makeSymbol('fetchPosts', 'src/clean.ts'),
      makeSymbol('saveDraft', 'src/clean.ts'),
      makeSymbol('deleteItem', 'src/clean.ts'),
    ];
    const input = makeInput(
      { 'src/clean.ts': makeParsedFile('src/clean.ts') },
      makeGraph([]),
      symbols,
    );
    expect(detectNamingInconsistency(input)).toHaveLength(0);
  });
});

// --- End-to-End ---

describe('runAudit', () => {
  it('returns empty findings for a clean codebase', () => {
    const symbols = [
      makeSymbol('getUser', 'src/auth.ts'),
      makeSymbol('signOut', 'src/auth.ts'),
    ];
    const graph = makeGraph([['src/cli.ts', 'src/auth.ts']]);
    const report = runAudit(
      makeInput(
        {
          'src/cli.ts': makeParsedFile('src/cli.ts'),
          'src/auth.ts': makeParsedFile('src/auth.ts'),
        },
        graph,
        symbols,
      ),
    );
    expect(report.findings).toHaveLength(0);
  });

  it('ranks findings by score descending', () => {
    // Set up: one critical junk drawer (hot) + one low naming issue (cold)
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 18; i++) {
      symbols.push(makeSymbol(`u${i}`, 'src/utils.ts'));
    }
    symbols.push(makeSymbol('getUser', 'src/mixed.ts'));
    symbols.push(makeSymbol('fetchPost', 'src/mixed.ts'));
    symbols.push(makeSymbol('get_user', 'src/mixed.ts'));
    symbols.push(makeSymbol('fetch_post', 'src/mixed.ts'));

    const graph = makeGraph([
      ['src/a.ts', 'src/utils.ts'],
      ['src/b.ts', 'src/utils.ts'],
      ['src/c.ts', 'src/utils.ts'],
    ]);
    const parsedFiles: Record<string, ParsedFile> = {
      'src/utils.ts': makeParsedFile('src/utils.ts'),
      'src/mixed.ts': makeParsedFile('src/mixed.ts'),
      'src/a.ts': makeParsedFile('src/a.ts'),
      'src/b.ts': makeParsedFile('src/b.ts'),
      'src/c.ts': makeParsedFile('src/c.ts'),
    };
    const report = runAudit(makeInput(parsedFiles, graph, symbols));

    expect(report.findings[0].severity).toBe('critical');
    expect(report.findings[0].score).toBeGreaterThan(report.findings[report.findings.length - 1].score);
  });

  it('aggregates severity counts correctly', () => {
    const symbols: ExtractedSymbol[] = [];
    for (let i = 0; i < 20; i++) {
      symbols.push(makeSymbol(`u${i}`, 'src/utils.ts'));
    }
    const report = runAudit(
      makeInput(
        { 'src/utils.ts': makeParsedFile('src/utils.ts') },
        makeGraph([]),
        symbols,
      ),
    );
    expect(report.stats.bySeverity.critical).toBeGreaterThanOrEqual(1);
    expect(report.stats.filesAnalyzed).toBe(1);
    expect(report.stats.rulesRun).toBeGreaterThan(0);
  });
});
