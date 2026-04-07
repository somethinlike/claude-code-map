import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface IndexStats {
  files: { name: string; sizeBytes: number; estimatedTokens: number }[];
  totalBytes: number;
  totalTokens: number;
}

/**
 * Estimate token count from byte size.
 * English markdown averages ~4 chars per token (GPT/Claude tokenizers).
 * Our output is compact structured text — slightly higher density.
 */
function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 3.5);
}

export function getIndexStats(outputDir: string): IndexStats | null {
  if (!existsSync(outputDir)) return null;

  const mdFiles = readdirSync(outputDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (mdFiles.length === 0) return null;

  const files = mdFiles.map((name) => {
    const fullPath = join(outputDir, name);
    const sizeBytes = statSync(fullPath).size;
    return {
      name,
      sizeBytes,
      estimatedTokens: estimateTokens(sizeBytes),
    };
  });

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const totalTokens = files.reduce((sum, f) => sum + f.estimatedTokens, 0);

  return { files, totalBytes, totalTokens };
}

export function formatStats(stats: IndexStats): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  .codemap/ index stats:');
  lines.push('  ─────────────────────────────────────────────');

  for (const f of stats.files) {
    const size = formatBytes(f.sizeBytes);
    const tokens = f.estimatedTokens.toLocaleString();
    lines.push(`  ${f.name.padEnd(20)} ${size.padStart(8)}   ~${tokens} tokens`);
  }

  lines.push('  ─────────────────────────────────────────────');
  lines.push(`  ${'Total'.padEnd(20)} ${formatBytes(stats.totalBytes).padStart(8)}   ~${stats.totalTokens.toLocaleString()} tokens`);
  lines.push('');
  lines.push(`  These tokens are loaded once per session via CLAUDE.md.`);
  lines.push(`  Without the index, Claude would spend 10-15 tool calls`);
  lines.push(`  exploring the same structure every conversation.`);
  lines.push('');
  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
