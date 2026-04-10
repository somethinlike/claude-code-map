import { describe, it, expect } from 'vitest';
import { formatAudit } from './audit-md.ts';
import type { AuditReport, AuditFinding } from '../types.ts';

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    rule: 'junk-drawer',
    severity: 'high',
    filePath: 'src/utils.ts',
    relatedFiles: [],
    title: 'Junk Drawer: utils.ts',
    signals: ['Filename matches junk-drawer pattern', '10 exports'],
    action: 'Extract into focused modules',
    hotness: 5,
    score: 125,
    ...overrides,
  };
}

describe('formatAudit', () => {
  it('returns null when there are no findings', () => {
    const report: AuditReport = {
      findings: [],
      stats: {
        filesAnalyzed: 5,
        rulesRun: 10,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    };
    expect(formatAudit(report)).toBeNull();
  });

  it('renders header with summary stats', () => {
    const report: AuditReport = {
      findings: [makeFinding()],
      stats: {
        filesAnalyzed: 33,
        rulesRun: 10,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      },
    };
    const result = formatAudit(report)!;
    expect(result).toContain('# Code Audit');
    expect(result).toContain('Files analyzed:** 33');
    expect(result).toContain('Findings:** 1');
    expect(result).toContain('1 high');
  });

  it('renders a Top Priority table', () => {
    const report: AuditReport = {
      findings: [
        makeFinding({ severity: 'critical', score: 300, filePath: 'src/god.ts' }),
        makeFinding({ severity: 'high', score: 100, filePath: 'src/utils.ts' }),
      ],
      stats: {
        filesAnalyzed: 5,
        rulesRun: 10,
        bySeverity: { critical: 1, high: 1, medium: 0, low: 0 },
      },
    };
    const result = formatAudit(report)!;
    expect(result).toContain('## Top Priority');
    expect(result).toContain('| # | Score | Severity |');
    expect(result).toContain('src/god.ts');
    expect(result).toContain('src/utils.ts');
  });

  it('groups findings by severity in descending order', () => {
    const report: AuditReport = {
      findings: [
        makeFinding({ severity: 'critical', filePath: 'src/a.ts' }),
        makeFinding({ severity: 'low', filePath: 'src/b.ts' }),
      ],
      stats: {
        filesAnalyzed: 5,
        rulesRun: 10,
        bySeverity: { critical: 1, high: 0, medium: 0, low: 1 },
      },
    };
    const result = formatAudit(report)!;
    const criticalIdx = result.indexOf('### Critical');
    const lowIdx = result.indexOf('### Low');
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(lowIdx).toBeGreaterThan(criticalIdx);
  });

  it('renders related files when present', () => {
    const report: AuditReport = {
      findings: [
        makeFinding({
          rule: 'circular-dependency',
          severity: 'critical',
          relatedFiles: ['src/b.ts', 'src/c.ts'],
        }),
      ],
      stats: {
        filesAnalyzed: 3,
        rulesRun: 10,
        bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
      },
    };
    const result = formatAudit(report)!;
    expect(result).toContain('Related:');
    expect(result).toContain('src/b.ts');
    expect(result).toContain('src/c.ts');
  });

  it('shows hotness in the heading when > 0', () => {
    const report: AuditReport = {
      findings: [makeFinding({ hotness: 23 })],
      stats: {
        filesAnalyzed: 5,
        rulesRun: 10,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      },
    };
    const result = formatAudit(report)!;
    expect(result).toContain('[hot: 23]');
  });

  it('omits hotness when hotness is 0', () => {
    const report: AuditReport = {
      findings: [makeFinding({ hotness: 0 })],
      stats: {
        filesAnalyzed: 5,
        rulesRun: 10,
        bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      },
    };
    const result = formatAudit(report)!;
    expect(result).not.toContain('[hot:');
  });
});
