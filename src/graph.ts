import type { ImportGraph, ImportEdge, HotFile, BlastRadius, ParsedFile, ExtractedRoute, ExtractedModel } from './types.ts';

/**
 * Build the import graph from parsed file data.
 * Only includes edges where resolvedPath is not null (internal imports).
 */
export function buildImportGraph(parsedFiles: Record<string, ParsedFile>): ImportGraph {
  const edges: ImportEdge[] = [];
  const adjacency: Record<string, string[]> = {};
  const reverseAdjacency: Record<string, string[]> = {};

  // Initialize adjacency lists for all known files
  for (const filePath of Object.keys(parsedFiles)) {
    adjacency[filePath] = [];
    reverseAdjacency[filePath] = [];
  }

  // Build edges from resolved imports
  for (const [filePath, parsed] of Object.entries(parsedFiles)) {
    const seen = new Set<string>();
    for (const imp of parsed.imports) {
      if (imp.resolvedPath && !imp.isExternal && !seen.has(imp.resolvedPath)) {
        seen.add(imp.resolvedPath);
        edges.push({ from: filePath, to: imp.resolvedPath });

        if (!adjacency[filePath]) adjacency[filePath] = [];
        adjacency[filePath].push(imp.resolvedPath);

        if (!reverseAdjacency[imp.resolvedPath]) reverseAdjacency[imp.resolvedPath] = [];
        reverseAdjacency[imp.resolvedPath].push(filePath);
      }
    }
  }

  // Compute hot files (sorted by in-degree descending)
  const hotFiles = computeHotFiles(adjacency, reverseAdjacency);

  return { edges, adjacency, reverseAdjacency, hotFiles };
}

/**
 * Rank files by import centrality: how many other files depend on each file.
 */
function computeHotFiles(
  adjacency: Record<string, readonly string[]>,
  reverseAdjacency: Record<string, readonly string[]>,
): HotFile[] {
  const allFiles = new Set<string>([
    ...Object.keys(adjacency),
    ...Object.keys(reverseAdjacency),
  ]);

  const hotFiles: HotFile[] = [];
  for (const filePath of allFiles) {
    const importedBy = (reverseAdjacency[filePath] ?? []).length;
    const imports = (adjacency[filePath] ?? []).length;
    if (importedBy > 0 || imports > 0) {
      hotFiles.push({ filePath, importedBy, imports });
    }
  }

  // Sort by importedBy (in-degree) descending, then by imports descending
  hotFiles.sort((a, b) => b.importedBy - a.importedBy || b.imports - a.imports);

  return hotFiles;
}

/**
 * Compute the blast radius for a target file: all files that transitively
 * depend on it, found via BFS through the reverse adjacency graph.
 *
 * Also cross-references affected files with routes and models to show
 * which API endpoints and data models are impacted.
 */
export function computeBlastRadius(
  graph: ImportGraph,
  targetFile: string,
  maxDepth: number,
  allRoutes: readonly ExtractedRoute[],
  allModels: readonly ExtractedModel[],
): BlastRadius {
  const affected: string[] = [];
  const visited = new Set<string>([targetFile]);
  let currentLevel = [targetFile];

  for (let depth = 0; depth < maxDepth && currentLevel.length > 0; depth++) {
    const nextLevel: string[] = [];
    for (const file of currentLevel) {
      const dependents = graph.reverseAdjacency[file] ?? [];
      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          affected.push(dep);
          nextLevel.push(dep);
        }
      }
    }
    currentLevel = nextLevel;
  }

  // Cross-reference affected files with routes
  const affectedFileSet = new Set(affected);
  affectedFileSet.add(targetFile);

  const affectedRoutes = allRoutes
    .filter((r) => affectedFileSet.has(r.filePath))
    .map((r) => `${r.method} ${r.path}`);

  const affectedModels = allModels
    .filter((m) => affectedFileSet.has(m.filePath))
    .map((m) => m.name);

  return {
    targetFile,
    affectedFiles: affected,
    depth: maxDepth,
    affectedRoutes: [...new Set(affectedRoutes)],
    affectedModels: [...new Set(affectedModels)],
  };
}

/**
 * Format blast radius as a human-readable string for CLI output.
 */
export function formatBlastRadius(blast: BlastRadius): string {
  const lines: string[] = [];
  lines.push(`Blast radius for ${blast.targetFile}:\n`);

  if (blast.affectedFiles.length === 0) {
    lines.push('  No other files depend on this file.');
    return lines.join('\n');
  }

  lines.push(`  ${blast.affectedFiles.length} affected file${blast.affectedFiles.length === 1 ? '' : 's'} (up to ${blast.depth} hops):`);
  for (const file of blast.affectedFiles.slice(0, 20)) {
    lines.push(`    ${file}`);
  }
  if (blast.affectedFiles.length > 20) {
    lines.push(`    ...and ${blast.affectedFiles.length - 20} more`);
  }

  if (blast.affectedRoutes.length > 0) {
    lines.push(`\n  Affected routes:`);
    for (const route of blast.affectedRoutes.slice(0, 10)) {
      lines.push(`    ${route}`);
    }
    if (blast.affectedRoutes.length > 10) {
      lines.push(`    ...and ${blast.affectedRoutes.length - 10} more`);
    }
  }

  if (blast.affectedModels.length > 0) {
    lines.push(`\n  Affected models:`);
    for (const model of blast.affectedModels) {
      lines.push(`    ${model}`);
    }
  }

  return lines.join('\n');
}

/**
 * Count external (third-party) package usage across all parsed files.
 * Returns packages sorted by number of files that import them.
 */
export function countExternalDeps(
  parsedFiles: Record<string, ParsedFile>,
): { name: string; usedBy: number }[] {
  const counts = new Map<string, Set<string>>();

  for (const [filePath, parsed] of Object.entries(parsedFiles)) {
    for (const imp of parsed.imports) {
      if (imp.isExternal) {
        // Normalize: take the package name (first segment or @scope/name)
        const pkgName = getPackageName(imp.source, imp.language);
        if (!counts.has(pkgName)) counts.set(pkgName, new Set());
        counts.get(pkgName)!.add(filePath);
      }
    }
  }

  return [...counts.entries()]
    .map(([name, files]) => ({ name, usedBy: files.size }))
    .sort((a, b) => b.usedBy - a.usedBy);
}

/**
 * Extract the top-level package name from an import specifier.
 */
function getPackageName(source: string, language: string): string {
  // JS/TS: @scope/pkg or bare pkg
  if (['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
    if (source.startsWith('@')) {
      const parts = source.split('/');
      return parts.slice(0, 2).join('/');
    }
    return source.split('/')[0];
  }

  // Python: top-level module
  if (language === 'python') {
    return source.split('.')[0];
  }

  // Go: full import path (first 3 segments for github.com/user/repo)
  if (language === 'go') {
    const parts = source.split('/');
    return parts.slice(0, Math.min(3, parts.length)).join('/');
  }

  // Java/Kotlin: first 2-3 segments (com.example.library)
  if (language === 'java' || language === 'kotlin') {
    const parts = source.split('.');
    return parts.slice(0, Math.min(3, parts.length)).join('.');
  }

  // Rust: crate name (first segment)
  if (language === 'rust') {
    return source.split('::')[0];
  }

  // PHP: first namespace segment
  if (language === 'php') {
    return source.split('\\')[0];
  }

  // C#: first 2 segments (System.Collections)
  if (language === 'csharp') {
    const parts = source.split('.');
    return parts.slice(0, Math.min(2, parts.length)).join('.');
  }

  // Ruby: bare name
  return source;
}
