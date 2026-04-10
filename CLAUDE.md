# claude-code-map -- Project Instructions

## What This Is
A CLI tool (`npx claude-code-map`) that pre-indexes codebases for AI coding assistants using tree-sitter AST parsing. Generates static markdown index files so Claude Code skips the 30-50K token exploration phase.

## Architecture
```
cli.ts (entry) → scanner.ts → parser.ts (WASM) → extractors/ → formatters/ → .codemap/
```

- **cli.ts**: Entry point, arg parsing, orchestration. Shebang `#!/usr/bin/env tsx`.
- **scanner.ts**: File discovery with include/exclude filtering.
- **parser.ts**: web-tree-sitter WASM init, language loading, query execution.
- **cache.ts**: Delta detection via mtime + file size.
- **framework-detector.ts**: Auto-detect Next.js/Astro/Express/Fastify/Django/Flask.
- **queries/{lang}.ts**: Language-specific tree-sitter S-expression queries + mappers.
- **extractors/{domain}.ts**: Dispatch to the right language query module.
- **formatters/{file}-md.ts**: Generate markdown output with collapsing strategies.

## Tech Stack
- TypeScript (strict, ES modules)
- web-tree-sitter (WASM, no native deps)
- tree-sitter-wasms (pre-built grammars)
- tsx (TypeScript runtime for npx shebang)
- Node >= 20

## Key Constraints
- No build step. Source ships as .ts, tsx runs it.
- Import paths use `.ts` extension (required by tsx ESM).
- WASM grammars load lazily from `node_modules/tree-sitter-wasms/out/`.
- Output dir defaults to `.codemap/` (add to .gitignore).
- Port/server: none. This is a one-shot CLI tool.

## Running Locally
```bash
node --import=tsx/esm src/cli.ts           # scan current dir
node --import=tsx/esm src/cli.ts --force   # ignore cache
node --import=tsx/esm src/cli.ts --hook    # install pre-commit hook
node --import=tsx/esm src/cli.ts @Symbol   # look up a symbol in the index
node --import=tsx/esm src/cli.ts --blast src/types.ts  # blast radius for a file
```

## Running Tests
```bash
npm test          # vitest run (one-shot)
npm run test:watch  # vitest watch mode
```

153 tests across 19 test files. Co-located: `src/**/*.test.ts`. Pure-logic tests only (no WASM in tests).

## V1.1 Features
- **`--hook`**: Generates a git pre-commit hook that auto-regenerates .codemap/ on every commit
- **`@symbol` lookup**: `claude-code-map @UserService` searches the index for matching symbols
- **Gitignore integration**: Scanner reads `.gitignore` and excludes matching directories automatically
- **Shared utils**: `src/utils.ts` — `truncate()` and `groupBy()` (extracted from 8 files)
- **`src/hook.ts`**: Pre-commit hook installation logic
- **`src/lookup.ts`**: Symbol lookup from cache-data.json

## V1.2 Features
- **PHP, Ruby, Kotlin**: Three new languages with query modules in `src/queries/`
- **`--stats`**: Shows index file sizes and estimated token counts
- **`--quiet` / `-q`**: Suppresses all output (for git hooks / CI)
- **`src/stats.ts`**: Index stats calculation and formatting

## V2.0 Features
- **Import graph extraction** via tree-sitter queries for all 12 languages
- **Import resolution**: raw import specifiers resolved to project-relative file paths
- **`graph.md` output**: `.codemap/graph.md` with hot files table (ranked by in-degree) + external dependencies summary
- **`--blast <file>` CLI flag**: prints blast radius to stdout -- BFS through reverse dependency edges, up to 3 hops
- **`src/extractors/imports.ts`**: import extraction dispatcher + resolver (relative paths to project files)
- **`src/graph.ts`**: graph construction (adjacency + reverse adjacency), BFS blast radius, hot files ranking
- **`src/formatters/graph-md.ts`**: graph markdown formatter

## V2.0.2 Features — Passive Code Audit
- **10 structural audit rules** run automatically on every index pass, detecting common AI-coding smells without reading source code
- **`audit.md` output**: `.codemap/audit.md` with Top Priority ranked table + findings grouped by severity
- **Heat-weighted scoring**: severity × `log10(1 + hotness)` — severity dominates at low hotness, extreme hotness can promote across tiers
- **Tarjan's SCC** for circular dependency detection (in `src/audit.ts` itself, no graph library dependency)
- **`src/audit.ts`**: `runAudit()` entry point + 10 rule functions (detectJunkDrawers, detectMonoliths, detectCircularDependencies, detectLayerViolations, detectDuplicatedDomains, detectTypeSprawl, detectLegacyMarkers, detectDeadFiles, detectUnusedExportFiles, detectNamingInconsistency)
- **`src/formatters/audit-md.ts`**: audit markdown formatter with Top Priority table
- **Entry point exemption list** (`AUDIT_ENTRY_POINT_PATTERNS` in `types.ts`): cli/main/index/config files are exempted from dead-file and unused-export rules
- **Type-only file exemption**: monolith rule skips files where all exports are interface/type/enum kinds (legitimate type barrels)
- **218 tests** across 22 test files (65 new audit tests)

## V2.0.4 — Re-export Graph Fix
- **TypeScript import extractor now captures re-exports.** `export * from './x.ts'` and `export { Foo } from './x.ts'` were previously invisible to `extractTsImports` because the queries only matched `import_statement` nodes. The new `EXPORT_FROM_QUERY` matches `(export_statement source: (string))` and runs alongside the three existing import queries.
- **`parseSource(source, language)`** in `src/parser.ts` is the new test seam — parses an in-memory string into a tree without touching disk. `parseFile` now wraps it.
- **226 tests** (218 + 8 new re-export tests in `src/queries/typescript.test.ts`).

## V2.0.3 Architecture — types.ts Decomposition
- **`src/types.ts` is now a 13-line `export *` barrel.** The actual type
  definitions live in `src/types/<domain>.ts` (one file per domain). New
  code should import from the specific domain file (`./types/symbols.ts`
  etc.) for clearer dependency intent. The barrel exists for backward
  compatibility — every existing `import { ... } from './types.ts'` site
  still works.
- **`src/extractors/type-info.ts`** (renamed from `types.ts`) is the
  tree-sitter type extractor. Renamed to avoid the path-stem collision
  with the new `src/types/` directory.
- **`ORM_AUDIT_COLUMNS`** (in `src/types/schema.ts`, renamed from
  `AUDIT_SKIP_FIELDS`) is the set of ORM-managed audit column names
  (createdAt/updatedAt/deletedAt/etc.) that the schema extractor skips
  when listing user-defined fields.
- **`AUDIT_ENTRY_POINT_PATTERNS`** (in `src/types/audit.ts`) — the regex
  list now exempts the entire `src/types/` directory from dead-file and
  unused-export rules.

## Calendar Versioning
Format: `YYYY.MM.DD.HHmm` (CST). npm uses semver (1.1.0), `--version` shows both.

## npm Publishing
```bash
npm publish   # publishes as `claude-code-map`
npx claude-code-map   # anyone can run it
```
