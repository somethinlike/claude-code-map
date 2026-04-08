#!/usr/bin/env tsx

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DEFAULT_CONFIG } from './types.ts';
import type { CodemapConfig } from './types.ts';
import { scanFiles, buildFileTree } from './scanner.ts';
import { detectFramework } from './framework-detector.ts';
import { initParser, parseFile } from './parser.ts';
import { loadCache, getChangedFiles, writeCache, writeCacheData, loadCacheData } from './cache.ts';
import { extractExportsAsync } from './extractors/exports.ts';
import { extractTypes } from './extractors/types.ts';
import { extractRoutes } from './extractors/routes.ts';
import { extractSchema } from './extractors/schema.ts';
import { formatStructure } from './formatters/structure-md.ts';
import { formatExports } from './formatters/exports-md.ts';
import { formatRoutes } from './formatters/routes-md.ts';
import { formatSchema } from './formatters/schema-md.ts';
import { formatTypes } from './formatters/types-md.ts';
import { extractImports, resolveImport } from './extractors/imports.ts';
import { buildImportGraph, computeBlastRadius, formatBlastRadius } from './graph.ts';
import { formatGraph } from './formatters/graph-md.ts';
import { extractAstroImports, extractAstroRoutes } from './queries/astro.ts';
import { installHook } from './hook.ts';
import { lookupSymbol } from './lookup.ts';
import { getIndexStats, formatStats } from './stats.ts';
import type { ParsedFile, ExtractedSymbol, ExtractedRoute, ExtractedType, ExtractedModel, ExtractedImport } from './types.ts';

// --- Version ---

function getVersion(): string {
  const pkgPath = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

// --- Argument Parsing ---

interface CliArgs {
  action: 'run' | 'help' | 'version' | 'hook' | 'lookup' | 'stats' | 'blast';
  output?: string;
  include: string[];
  exclude: string[];
  schema: string[];
  force: boolean;
  quiet: boolean;
  symbolQuery?: string;
  blastTarget?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    action: 'run',
    include: [],
    exclude: [],
    schema: [],
    force: false,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        result.action = 'help';
        break;
      case '--version':
      case '-v':
        result.action = 'version';
        break;
      case '--force':
        result.force = true;
        break;
      case '--output':
        result.output = args[++i];
        break;
      case '--include':
        result.include.push(args[++i]);
        break;
      case '--exclude':
        result.exclude.push(args[++i]);
        break;
      case '--hook':
        result.action = 'hook';
        break;
      case '--stats':
        result.action = 'stats';
        break;
      case '--quiet':
      case '-q':
        result.quiet = true;
        break;
      case '--schema':
        result.schema.push(args[++i]);
        break;
      case '--blast':
        result.action = 'blast';
        result.blastTarget = args[++i];
        break;
      default:
        if (arg.startsWith('@')) {
          result.action = 'lookup';
          result.symbolQuery = arg.slice(1);
        } else if (arg.startsWith('-')) {
          console.error(`Unknown flag: ${arg}`);
          process.exit(1);
        }
    }
  }

  return result;
}

// --- Config Loading ---

function loadConfig(projectRoot: string, cliArgs: CliArgs): CodemapConfig {
  const configPath = join(projectRoot, 'codemap.config.json');
  let fileConfig: Partial<CodemapConfig> = {};

  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.log('[codemap] Loaded codemap.config.json');
    } catch (err) {
      console.error(`[codemap] Warning: Could not parse codemap.config.json: ${err}`);
    }
  }

  return {
    include: cliArgs.include.length > 0
      ? cliArgs.include
      : (fileConfig.include ?? DEFAULT_CONFIG.include),
    exclude: cliArgs.exclude.length > 0
      ? [...(fileConfig.exclude ?? DEFAULT_CONFIG.exclude), ...cliArgs.exclude]
      : (fileConfig.exclude ?? DEFAULT_CONFIG.exclude),
    output: cliArgs.output ?? fileConfig.output ?? DEFAULT_CONFIG.output,
    schema: cliArgs.schema.length > 0
      ? [...(fileConfig.schema ?? DEFAULT_CONFIG.schema), ...cliArgs.schema]
      : (fileConfig.schema ?? DEFAULT_CONFIG.schema),
  };
}

// --- Help Text ---

function printHelp(): void {
  console.log(`
claude-code-map — Pre-index your codebase for AI assistants

Usage:
  npx claude-code-map [options]
  npx claude-code-map @<symbol>          # Look up a symbol in the index
  npx claude-code-map --blast <file>     # Show blast radius for a file

Options:
  --output <dir>      Output directory (default: .codemap)
  --include <glob>    Include directory (repeatable)
  --exclude <glob>    Exclude pattern (repeatable)
  --schema <path>     Schema file path (repeatable)
  --force             Ignore cache, re-parse everything
  --hook              Install pre-commit git hook for auto-regeneration
  --stats             Show index file sizes and estimated token counts
  --blast <file>      Show blast radius (what depends on this file)
  --quiet, -q         Suppress all output (for git hooks / CI)
  --help, -h          Show this help
  --version, -v       Show version

Examples:
  npx claude-code-map                          # Scan current directory
  npx claude-code-map --include src --include lib
  npx claude-code-map --exclude "*.test.ts"
  npx claude-code-map --force                  # Full re-scan
  npx claude-code-map --hook                   # Install git hook
  npx claude-code-map --stats                  # Show token estimate
  npx claude-code-map --blast src/lib/db.ts    # Blast radius
  npx claude-code-map @parseArgs               # Look up symbol

Output:
  .codemap/structure.md   File tree with framework annotations
  .codemap/exports.md     Exported functions, classes, types
  .codemap/routes.md      HTTP routes with methods and auth
  .codemap/schema.md      Database schema (if detected)
  .codemap/types.md       Interfaces, enums, type aliases
  .codemap/graph.md       Import dependency graph and hot files

Languages:
  TypeScript, JavaScript, TSX, JSX, Python, Go, Rust, Java, C#,
  PHP, Ruby, Kotlin
`);
}

// --- Main ---

async function main(): Promise<void> {
  const startTime = performance.now();
  const cliArgs = parseArgs(process.argv);

  // Quiet mode: suppress all console.log output
  const log = cliArgs.quiet ? (..._args: unknown[]) => {} : console.log.bind(console);

  if (cliArgs.action === 'help') {
    printHelp();
    return;
  }
  if (cliArgs.action === 'version') {
    console.log(getVersion());
    return;
  }

  const projectRoot = resolve('.');

  if (cliArgs.action === 'hook') {
    installHook(projectRoot);
    return;
  }

  const config = loadConfig(projectRoot, cliArgs);
  const outputDir = resolve(projectRoot, config.output);

  if (cliArgs.action === 'stats') {
    const stats = getIndexStats(outputDir);
    if (!stats) {
      console.log('[codemap] No index found. Run `npx claude-code-map` first.');
      return;
    }
    console.log(formatStats(stats));
    return;
  }

  if (cliArgs.action === 'lookup') {
    lookupSymbol(cliArgs.symbolQuery!, outputDir);
    return;
  }

  // Blast radius needs a full scan first — handled after parsing below

  // Step 1: Detect framework
  log('[codemap] Detecting framework...');
  const framework = await detectFramework(projectRoot);
  log(`[codemap] Framework: ${framework.name}`);

  // Step 2: Scan files
  log('[codemap] Scanning files...');
  const files = await scanFiles(projectRoot, config);
  log(`[codemap] Found ${files.length} source files`);

  if (files.length === 0) {
    log('[codemap] No supported source files found. Nothing to index.');
    return;
  }

  // Step 3: Check cache
  const cache = loadCache(outputDir);
  const cacheData = loadCacheData(outputDir);
  const { changed, unchanged } = cliArgs.force
    ? { changed: files, unchanged: [] }
    : getChangedFiles(files, cache);

  if (changed.length === 0 && !cliArgs.force && cliArgs.action !== 'blast') {
    log('[codemap] All files unchanged. Use --force to re-scan.');
    return;
  }

  log(`[codemap] Parsing ${changed.length} changed files (${unchanged.length} cached)...`);

  // Step 4: Initialize parser
  await initParser();

  // Step 5: Parse changed files
  const allSymbols: ExtractedSymbol[] = [];
  const allRoutes: ExtractedRoute[] = [];
  const allTypes: ExtractedType[] = [];
  const allImports: ExtractedImport[] = [];
  const parsedFiles: Record<string, ParsedFile> = {};

  // Load cached data for unchanged files
  for (const filePath of unchanged) {
    if (cacheData && cacheData[filePath]) {
      const cached = cacheData[filePath];
      allSymbols.push(...cached.symbols);
      allRoutes.push(...cached.routes);
      allTypes.push(...cached.types);
      if (cached.imports) allImports.push(...cached.imports);
      parsedFiles[filePath] = {
        ...cached,
        imports: cached.imports ?? [],
      };
    }
  }

  // Parse changed files
  let parseErrors = 0;
  for (const file of changed) {
    try {
      // .astro files: no tree-sitter grammar, use regex extraction
      if (file.language === 'astro') {
        let source: string;
        try {
          source = readFileSync(file.absolutePath, 'utf-8');
        } catch {
          parseErrors++;
          continue;
        }

        const imports = extractAstroImports(source, file.relativePath);
        const routes = extractAstroRoutes(file.relativePath);

        allRoutes.push(...routes);
        allImports.push(...imports);

        parsedFiles[file.relativePath] = {
          filePath: file.relativePath,
          language: file.language,
          symbols: [],
          routes,
          types: [],
          imports,
        };
        continue;
      }

      const tree = await parseFile(file.absolutePath, file.language);
      if (!tree) {
        parseErrors++;
        continue;
      }

      const symbols = await extractExportsAsync(tree, file.language, file.relativePath);
      const routes = await extractRoutes(tree, file.language, file.relativePath, framework);
      const types = await extractTypes(tree, file.language, file.relativePath);
      const imports = await extractImports(tree, file.language, file.relativePath);

      allSymbols.push(...symbols);
      allRoutes.push(...routes);
      allTypes.push(...types);
      allImports.push(...imports);

      parsedFiles[file.relativePath] = {
        filePath: file.relativePath,
        language: file.language,
        symbols,
        routes,
        types,
        imports,
      };
    } catch (err) {
      parseErrors++;
      console.error(`[codemap] Warning: Failed to parse ${file.relativePath}: ${err}`);
    }
  }

  // Step 5b: Resolve imports against project file set
  const projectFileSet = new Set(files.map((f) => f.relativePath));
  for (const [filePath, parsed] of Object.entries(parsedFiles)) {
    const resolvedImports = parsed.imports.map((imp) => {
      if (imp.isExternal || imp.resolvedPath) return imp;
      const resolved = resolveImport(imp.source, filePath, projectFileSet, imp.language);
      return resolved ? { ...imp, resolvedPath: resolved, isExternal: false } : imp;
    });
    parsedFiles[filePath] = { ...parsed, imports: resolvedImports };
  }

  // Step 5c: Build import graph
  const importGraph = buildImportGraph(parsedFiles);

  // Step 6: Extract schema
  const models: ExtractedModel[] = await extractSchema(projectRoot, config);

  // Handle --blast action (needs graph + schema, then exits)
  if (cliArgs.action === 'blast') {
    const blast = computeBlastRadius(importGraph, cliArgs.blastTarget!, 3, allRoutes, models);
    console.log(formatBlastRadius(blast));
    return;
  }

  // Step 7: Build file tree
  const fileTree = buildFileTree(files, projectRoot, framework);

  // Step 8: Format and write output
  mkdirSync(outputDir, { recursive: true });

  const structureMd = formatStructure(fileTree, framework, {
    totalFiles: files.length,
    languages: [...new Set(files.map((f) => f.language))],
  });
  writeFileSync(join(outputDir, 'structure.md'), structureMd);

  const exportsMd = formatExports(allSymbols);
  writeFileSync(join(outputDir, 'exports.md'), exportsMd);

  const typesMd = formatTypes(allTypes);
  writeFileSync(join(outputDir, 'types.md'), typesMd);

  const routesMd = formatRoutes(allRoutes, framework);
  if (routesMd) {
    writeFileSync(join(outputDir, 'routes.md'), routesMd);
  }

  const schemaMd = formatSchema(models);
  if (schemaMd) {
    writeFileSync(join(outputDir, 'schema.md'), schemaMd);
  }

  const graphMd = formatGraph(importGraph, parsedFiles);
  if (graphMd) {
    writeFileSync(join(outputDir, 'graph.md'), graphMd);
  }

  // Step 9: Write cache
  writeCache(outputDir, files);
  writeCacheData(outputDir, parsedFiles);

  // Step 10: Summary
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  const outputFiles = ['structure.md', 'exports.md', 'types.md'];
  if (routesMd) outputFiles.push('routes.md');
  if (schemaMd) outputFiles.push('schema.md');
  if (graphMd) outputFiles.push('graph.md');

  log(`\n[codemap] Done in ${elapsed}s`);
  log(`[codemap] ${files.length} files → ${outputFiles.length} index files in ${config.output}/`);
  log(`[codemap] ${allSymbols.length} exports, ${allRoutes.length} routes, ${allTypes.length} types, ${models.length} models`);
  if (importGraph.edges.length > 0) {
    log(`[codemap] ${importGraph.edges.length} internal import edges, ${importGraph.hotFiles.length} connected files`);
  }
  if (parseErrors > 0) {
    log(`[codemap] ${parseErrors} files had parse errors (skipped)`);
  }
  log(`\nAdd to your CLAUDE.md:`);
  log(`  Read the .codemap/ directory for project structure before exploring files.`);
}

main().catch((err) => {
  console.error(`[codemap] Fatal: ${err.message || err}`);
  process.exit(1);
});
