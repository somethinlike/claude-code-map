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
import { installHook } from './hook.ts';
import { lookupSymbol } from './lookup.ts';
import type { ParsedFile, ExtractedSymbol, ExtractedRoute, ExtractedType, ExtractedModel } from './types.ts';

// --- Version ---

function getVersion(): string {
  const pkgPath = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

// --- Argument Parsing ---

interface CliArgs {
  action: 'run' | 'help' | 'version' | 'hook' | 'lookup';
  output?: string;
  include: string[];
  exclude: string[];
  schema: string[];
  force: boolean;
  symbolQuery?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    action: 'run',
    include: [],
    exclude: [],
    schema: [],
    force: false,
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
      case '--schema':
        result.schema.push(args[++i]);
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

Options:
  --output <dir>      Output directory (default: .codemap)
  --include <glob>    Include directory (repeatable)
  --exclude <glob>    Exclude pattern (repeatable)
  --schema <path>     Schema file path (repeatable)
  --force             Ignore cache, re-parse everything
  --hook              Install pre-commit git hook for auto-regeneration
  --help, -h          Show this help
  --version, -v       Show version

Examples:
  npx claude-code-map                          # Scan current directory
  npx claude-code-map --include src --include lib
  npx claude-code-map --exclude "*.test.ts"
  npx claude-code-map --force                  # Full re-scan
  npx claude-code-map --hook                   # Install git hook
  npx claude-code-map @parseArgs               # Look up symbol

Output:
  .codemap/structure.md   File tree with framework annotations
  .codemap/exports.md     Exported functions, classes, types
  .codemap/routes.md      HTTP routes with methods and auth
  .codemap/schema.md      Database schema (if detected)
  .codemap/types.md       Interfaces, enums, type aliases
`);
}

// --- Main ---

async function main(): Promise<void> {
  const startTime = performance.now();
  const cliArgs = parseArgs(process.argv);

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

  if (cliArgs.action === 'lookup') {
    lookupSymbol(cliArgs.symbolQuery!, outputDir);
    return;
  }

  // Step 1: Detect framework
  console.log('[codemap] Detecting framework...');
  const framework = await detectFramework(projectRoot);
  console.log(`[codemap] Framework: ${framework.name}`);

  // Step 2: Scan files
  console.log('[codemap] Scanning files...');
  const files = await scanFiles(projectRoot, config);
  console.log(`[codemap] Found ${files.length} source files`);

  if (files.length === 0) {
    console.log('[codemap] No supported source files found. Nothing to index.');
    return;
  }

  // Step 3: Check cache
  const cache = loadCache(outputDir);
  const cacheData = loadCacheData(outputDir);
  const { changed, unchanged } = cliArgs.force
    ? { changed: files, unchanged: [] }
    : getChangedFiles(files, cache);

  if (changed.length === 0 && !cliArgs.force) {
    console.log('[codemap] All files unchanged. Use --force to re-scan.');
    return;
  }

  console.log(`[codemap] Parsing ${changed.length} changed files (${unchanged.length} cached)...`);

  // Step 4: Initialize parser
  await initParser();

  // Step 5: Parse changed files
  const allSymbols: ExtractedSymbol[] = [];
  const allRoutes: ExtractedRoute[] = [];
  const allTypes: ExtractedType[] = [];
  const parsedFiles: Record<string, ParsedFile> = {};

  // Load cached data for unchanged files
  for (const filePath of unchanged) {
    if (cacheData && cacheData[filePath]) {
      const cached = cacheData[filePath];
      allSymbols.push(...cached.symbols);
      allRoutes.push(...cached.routes);
      allTypes.push(...cached.types);
      parsedFiles[filePath] = cached;
    }
  }

  // Parse changed files
  let parseErrors = 0;
  for (const file of changed) {
    try {
      const tree = await parseFile(file.absolutePath, file.language);
      if (!tree) {
        parseErrors++;
        continue;
      }

      const symbols = await extractExportsAsync(tree, file.language, file.relativePath);
      const routes = await extractRoutes(tree, file.language, file.relativePath, framework);
      const types = await extractTypes(tree, file.language, file.relativePath);

      allSymbols.push(...symbols);
      allRoutes.push(...routes);
      allTypes.push(...types);

      parsedFiles[file.relativePath] = {
        filePath: file.relativePath,
        language: file.language,
        symbols,
        routes,
        types,
      };
    } catch (err) {
      parseErrors++;
      console.error(`[codemap] Warning: Failed to parse ${file.relativePath}: ${err}`);
    }
  }

  // Step 6: Extract schema
  const models: ExtractedModel[] = await extractSchema(projectRoot, config);

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

  // Step 9: Write cache
  writeCache(outputDir, files);
  writeCacheData(outputDir, parsedFiles);

  // Step 10: Summary
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  const outputFiles = ['structure.md', 'exports.md', 'types.md'];
  if (routesMd) outputFiles.push('routes.md');
  if (schemaMd) outputFiles.push('schema.md');

  console.log(`\n[codemap] Done in ${elapsed}s`);
  console.log(`[codemap] ${files.length} files → ${outputFiles.length} index files in ${config.output}/`);
  console.log(`[codemap] ${allSymbols.length} exports, ${allRoutes.length} routes, ${allTypes.length} types, ${models.length} models`);
  if (parseErrors > 0) {
    console.log(`[codemap] ${parseErrors} files had parse errors (skipped)`);
  }
  console.log(`\nAdd to your CLAUDE.md:`);
  console.log(`  Read the .codemap/ directory for project structure before exploring files.`);
}

main().catch((err) => {
  console.error(`[codemap] Fatal: ${err.message || err}`);
  process.exit(1);
});
