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
- **153 tests** across 19 test files

## Calendar Versioning
Format: `YYYY.MM.DD.HHmm` (CST). npm uses semver (1.1.0), `--version` shows both.

## npm Publishing
```bash
npm publish   # publishes as `claude-code-map`
npx claude-code-map   # anyone can run it
```
