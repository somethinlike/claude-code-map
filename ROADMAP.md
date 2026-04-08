# claude-code-map — Roadmap & Implementation Plan

## Origin

Inspired by a lengthy r/ClaudeAI discussion where dozens of developers shared competing solutions to the same problem:
https://old.reddit.com/r/ClaudeAI/comments/1sa2jbz/i_built_a_tool_that_saves_50k_tokens_per_claude/

OP built `ai-codex` (regex-based, Node). Comments surfaced: Cymbal (SQLite + tree-sitter, Go), JCodeMunch (MCP server, tree-sitter), TheBrain (persistent memory), Pampa/PampaX, codanna, LeanCTX, grepai, codebase-memory-mcp, CLI-Task-System, Lumen, and more. Every tool had a different tradeoff — license, language support, runtime requirements, or output format. `claude-code-map` synthesizes the best ideas: tree-sitter AST (like Cymbal/JCodeMunch), static markdown output (like ai-codex), zero native deps via WASM, CC0 license, and npx-ready.

## Problem

Claude Code spends 30-50K tokens at the start of every conversation exploring project structure (routes, exports, schema, types). This is repeated work — the same structural discovery every time. `claude-code-map` solves this by generating static markdown index files from tree-sitter AST parsing. One `npx claude-code-map` call, one line in CLAUDE.md, and every future conversation starts with the map already in hand.

## Competitive Landscape

| Tool | Extraction | Languages | License | Gap |
|------|-----------|-----------|---------|-----|
| ai-codex | Regex | TS/JS only | MIT | Fragile, narrow |
| Cymbal | tree-sitter | 24 languages | **No license** | Can't legally use |
| TheBrain | Regex | 9 languages | **GPL-3.0** | Copyleft |
| jCodeMunch | tree-sitter | 35+ languages | **Paid commercial** | $79-$2,249 |
| codesight | TS Compiler API + regex | 13+ languages | Unknown | MCP server, blast radius, wiki articles — but regex for non-TS |

`claude-code-map` fills the gap: **CC0-licensed, tree-sitter AST for ALL languages, polyglot, zero-config, npx-ready.**

### codesight Competitive Reference

Thread: https://old.reddit.com/r/ClaudeAI/comments/1sfdztg/90_fewer_tokens_per_session_by_reading_a/
(106 comments, overwhelmingly positive reception — April 2026)

**What codesight has that we don't (yet):**
- MCP server mode (8-11 tools: get routes, schema, blast radius, hot files, live scan, refresh)
- Import graph / blast radius analysis
- Progressive article loading (200-token index → domain articles on demand)
- Auto-CLAUDE.md injection (`--profile claude-code`)
- Watch mode (`--watch`)
- Interactive HTML report (`--open`)
- Broader framework detection (NestJS, Nuxt, SvelteKit, Laravel, Rails, Phoenix)

**What we have that codesight doesn't:**
- Real tree-sitter AST for all 12 languages (codesight uses regex for non-TS)
- Symbol lookup (`@Symbol`)
- Token stats (`--stats`)
- 109-test suite
- CC0 license (unambiguous public domain)

**Key community feedback from the thread:**
- Monorepo scaling is a real problem — relevance filtering needed
- MCP vs CLI debate: both should exist (codesight ships both)
- Import graph / dependency analysis is highly requested
- Progressive disclosure saves tokens but adds complexity
- Monorepo with many contributors: `.gitignore` the output or use MCP mode to avoid merge conflicts

## Architecture

```
npx claude-code-map
  → Detect framework (Next.js, Astro, Express, Django, etc.)
  → Scan files (respect include/exclude)
  → Check cache (skip unchanged files)
  → Parse with web-tree-sitter (WASM, no native deps)
  → Extract symbols, routes, types, schema
  → Format as compact markdown
  → Write to .codemap/
```

## Project Structure

```
claude-code-map/
├── src/
│   ├── cli.ts                  # #!/usr/bin/env tsx — entry point + orchestration
│   ├── types.ts                # All shared types + constants
│   ├── scanner.ts              # File discovery, tree building
│   ├── parser.ts               # web-tree-sitter WASM setup + query runner
│   ├── cache.ts                # Delta detection (mtime + size)
│   ├── framework-detector.ts   # Auto-detect Next.js/Astro/Express/Django/etc.
│   ├── queries/
│   │   ├── typescript.ts       # TS/JS/TSX tree-sitter S-expression queries
│   │   ├── python.ts
│   │   ├── go.ts
│   │   ├── rust.ts
│   │   ├── java.ts
│   │   └── csharp.ts
│   ├── extractors/
│   │   ├── exports.ts          # Extract exported symbols via AST
│   │   ├── routes.ts           # Extract HTTP routes (file-based + code-based)
│   │   ├── schema.ts           # Extract DB schema (Prisma, Django, etc.)
│   │   └── types.ts            # Extract interfaces/enums/type aliases
│   └── formatters/
│       ├── structure-md.ts     # → .codemap/structure.md
│       ├── exports-md.ts       # → .codemap/exports.md
│       ├── routes-md.ts        # → .codemap/routes.md (if routes detected)
│       ├── schema-md.ts        # → .codemap/schema.md (if schema detected)
│       └── types-md.ts         # → .codemap/types.md
├── package.json                # bin: {"claude-code-map": "./src/cli.ts"}
├── tsconfig.json
├── LICENSE                     # MIT
├── README.md                   # With gospel attribution
├── CLAUDE.md
├── MANUAL-TESTS.md
└── ROADMAP.md                  # This file
```

## Key Dependencies

| Package | Purpose | Why |
|---------|---------|-----|
| `tsx` | TypeScript runtime | Shebang `#!/usr/bin/env tsx` for npx — users don't need Node 24 |
| `web-tree-sitter` | WASM-based parser | No native compilation = npx works everywhere without build tools |
| `tree-sitter-wasms` | Pre-built WASM grammars | TS, JS, Python, Go, Rust, Java, C# pre-compiled to WASM |

## V1 Scope

### Languages Supported
TypeScript, JavaScript, TSX, JSX, Python, Go, Rust, Java, C#

### Framework Detection (first match wins)
1. `next.config.*` → Next.js (App/Pages/Both)
2. `astro.config.*` → Astro
3. `express` in package.json deps → Express
4. `fastify` in package.json deps → Fastify
5. `manage.py` + `urls.py` → Django
6. Python file imports Flask → Flask
7. Fallback → Generic

### Output Files (written to `.codemap/`)
- **structure.md** — annotated file tree with framework info
- **exports.md** — all exported functions/classes/types with signatures
- **routes.md** — HTTP routes with methods, auth tags (only if routes detected)
- **schema.md** — DB schema, compact format (only if schema detected)
- **types.md** — interfaces, enums, type aliases with fields

### Collapsing Strategies (proven patterns from ai-codex)
- Routes: 5+ sub-routes under same prefix → collapse to summary
- Exports: 4+ per file → show top 4 + "+N more"
- Types: 6+ fields → show first 5 + "...and N more fields"
- File tree: 5+ files at same level → show first 3 + "...N more"

### CLI
```bash
npx claude-code-map                         # Scan current directory
npx claude-code-map --output .ai-index      # Custom output dir
npx claude-code-map --include src lib        # Only scan these dirs
npx claude-code-map --exclude "**/*.test.ts" # Skip test files
npx claude-code-map --force                  # Ignore cache
npx claude-code-map --help
```

### Config File (`codemap.config.json`)
```json
{
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/*.test.ts"],
  "output": ".codemap",
  "schema": ["prisma/schema.prisma"]
}
```

### Cache (delta-aware regeneration)
`.codemap/cache.json` stores `{path → {mtimeMs, size}}`. On subsequent runs, only changed files are re-parsed. `--force` bypasses cache. `.codemap/cache-data.json` stores extraction results per file.

## V1.1 (Community-Driven Release) — Complete

Inspired by community feedback from the [origin thread](https://old.reddit.com/r/ClaudeAI/comments/1sa2jbz/). Features:

- [x] **Quality Standard**: 88+ vitest tests co-located with source (13 test files)
- [x] **Shared utils**: Extracted `truncate()` and `groupBy()` from 8 duplicated files
- [x] **`--hook` flag**: Generates git pre-commit hook for auto-regeneration
- [x] **`@symbol` lookup**: Search the index for symbols by name
- [x] **Gitignore integration**: Scanner respects `.gitignore` patterns
- [x] **Java Spring route fix**: Extract actual annotation path, not handler name
- [x] **C# modifier detection**: Check for `public` keyword instead of hardcoding `isExported: true`

## V1.2 (Language Expansion + Quality of Life) — Complete

- [x] **PHP support**: Classes, interfaces, traits, enums (PHP 8.1+), functions, public methods, Laravel routes
- [x] **Ruby support**: Classes, modules, methods, singleton methods, attr_accessor fields, Rails routes
- [x] **Kotlin support**: Functions, classes, objects, interfaces, Spring Boot routes with class-level prefixes
- [x] **`--stats` flag**: Shows index file sizes and estimated token counts
- [x] **`--quiet` / `-q` flag**: Suppresses all output for git hooks and CI
- [x] **Pre-commit hook fix**: Hook now uses `--quiet` and `|| true` to never block commits
- [x] **109 tests** across 16 test files

## V2 Scope — Import Graph, MCP Server, and Competitive Parity

Driven by competitive analysis of codesight (see Competitive Landscape above). V2 closes the feature gap while preserving our AST correctness advantage.

### V2.0: Import Graph & Blast Radius (npm 2.0.0)

The foundational release. Import graph is a prerequisite for blast radius, hot files, and MCP server tools.

**Features:**
- [ ] Import extraction via tree-sitter queries for all 12 languages
- [ ] Import resolution (raw specifier → project-relative path)
- [ ] Dependency graph construction (adjacency + reverse adjacency)
- [ ] Hot files ranking (sorted by in-degree / number of dependents)
- [ ] Blast radius computation (BFS through reverse edges)
- [ ] New output: `.codemap/graph.md` with hot files table + external deps summary
- [ ] New CLI flag: `--blast <file>` prints blast radius to stdout
- [ ] Cache integration: store imports in `cache-data.json`, bump cache version

**New files:** `src/extractors/imports.ts`, `src/graph.ts`, `src/formatters/graph-md.ts` + tests
**Modified files:** `src/types.ts`, `src/cli.ts`, `src/cache.ts`, all 9 `src/queries/*.ts` files
**New types:** `ExtractedImport`, `ImportEdge`, `ImportGraph`, `HotFile`, `BlastRadius`
**Dependencies:** None (pure in-memory graph)

### V2.1: MCP Server (separate package: `claude-code-map-mcp`, npm 2.1.0)

Ships as a **separate npm package** to keep the core CLI zero-bloat.

**8 MCP tools:**
| Tool | Input | Returns |
|------|-------|---------|
| `codemap_get_structure` | none | structure.md content |
| `codemap_get_exports` | `{ file?, kind? }` | filtered exports |
| `codemap_get_routes` | `{ method?, prefix? }` | filtered routes |
| `codemap_get_types` | `{ file? }` | filtered types |
| `codemap_get_schema` | none | schema content |
| `codemap_get_graph` | none | graph.md content |
| `codemap_get_blast_radius` | `{ file, depth? }` | blast radius analysis |
| `codemap_refresh` | none | re-scan changed files, rebuild |

**Architecture:** Long-lived stdio process. Parses once at startup, serves from memory. `codemap_refresh` re-runs delta detection.
**Package:** `claude-code-map-mcp` — deps: `claude-code-map` (peer), `@modelcontextprotocol/sdk`, `zod`
**Core package changes:** Export extraction pipeline functions via `package.json` `"exports"` field

### V2.2: Developer Experience (npm 2.2.0)

- [ ] `--init` flag: auto-inject codemap instructions into CLAUDE.md (create or append)
- [ ] `index.md` progressive index: ~200-token summary table listing each output file with content description and token estimate
- [ ] CLAUDE.md stanza references `index.md` as the entry point

**New files:** `src/init.ts`, `src/formatters/index-md.ts` + tests

### V2.3: Watch Mode + Languages (npm 2.3.0)

- [ ] `--watch` mode using `node:fs.watch(root, { recursive: true })` with 300ms debounce
- [ ] New languages: Swift (`.swift`), Elixir (`.ex`/`.exs`), Dart (`.dart`)
- [ ] Broader framework detection: NestJS, Nuxt, SvelteKit, Laravel, Rails, Spring Boot, Phoenix
- [ ] Monorepo workspace detection (pnpm/npm workspaces, per-package output)

### V2 Build Order (V2.0 detail)

1. Types (`types.ts`) — new interfaces
2. TS import query (`queries/typescript.ts`) — validate approach
3. Import resolution (`extractors/imports.ts`) — resolveImport() + dispatcher
4. Remaining language import queries (8 files)
5. Graph module (`graph.ts`) — build, BFS, hotFiles
6. Graph formatter (`formatters/graph-md.ts`)
7. Wire into CLI (`cli.ts`) — --blast, pipeline integration, write graph.md
8. Bump cache version (`cache.ts`)
9. Tests across all new modules
10. Update docs (ROADMAP, README, CLAUDE.md, MANUAL-TESTS.md)

## Implementation Sequence

### Phase 1 — Foundation
1. package.json, tsconfig.json, .gitignore
2. src/types.ts (all shared types + constants)
3. src/cli.ts skeleton (arg parsing, help text, orchestration shell)

### Phase 2 — Core Parsing (highest risk — validate WASM loading early)
4. src/parser.ts (web-tree-sitter WASM init + query runner)
5. src/queries/typescript.ts (first language — most complex query set)
6. src/scanner.ts (file discovery + tree building)

### Phase 3 — Extraction
7. src/extractors/exports.ts
8. src/extractors/types.ts
9. src/extractors/routes.ts
10. src/framework-detector.ts

### Phase 4 — Formatting
11. src/formatters/structure-md.ts
12. src/formatters/exports-md.ts
13. src/formatters/routes-md.ts
14. src/formatters/types-md.ts

### Phase 5 — Schema + Cache + Wiring
15. src/extractors/schema.ts (Prisma regex parser)
16. src/formatters/schema-md.ts
17. src/cache.ts
18. Wire up full orchestration in src/cli.ts

### Phase 6 — Multi-Language Queries
19. src/queries/python.ts
20. src/queries/go.ts
21. src/queries/rust.ts
22. src/queries/java.ts
23. src/queries/csharp.ts

### Phase 7 — Documentation + Testing
24. CLAUDE.md, MANUAL-TESTS.md, README.md (with gospel attribution), LICENSE
25. Test against real projects: logoslens, courtscribe, page-save, OEB-Ministry

### Phase 8 — Publish
26. npm publish
27. Test `npx claude-code-map` from a clean directory
28. Test cache: run twice, verify second run is faster

## Key Technical Decisions

### Why web-tree-sitter (WASM) over native tree-sitter
Native `tree-sitter` requires node-gyp, Python, and a C compiler. For an `npx` tool that anyone can run without installing build tools, WASM is the only option. Performance penalty is negligible (~5ms per 500-line file).

### Why tsx over --experimental-strip-types
Ryan uses Node 24 locally, but npx users could be on Node 20 or 22. `tsx` (shipped as a dependency) works on all Node versions >= 18 and handles the shebang correctly.

### Why static markdown over SQLite/MCP
- Any AI tool can read markdown files — not locked to Claude
- Zero runtime process — no server to start/manage
- Git-friendly — the index files can be committed and versioned
- CLAUDE.md can reference them with a single line

### Why base64 over WebSocket (from page-save)
Chrome extensions can't write to filesystem directly. The MHTML data must cross the extension boundary via WebSocket, and base64 is the simplest encoding for binary-over-text transport.

## Tree-sitter Query Patterns (TypeScript Reference)

```
# Named function export
(export_statement
  declaration: (function_declaration
    name: (identifier) @fn_name
    parameters: (formal_parameters) @fn_params
    return_type: (type_annotation)? @fn_return))

# Named class export
(export_statement
  declaration: (class_declaration
    name: (type_identifier) @class_name))

# Interface export
(export_statement
  declaration: (interface_declaration
    name: (type_identifier) @iface_name
    body: (interface_body) @iface_body))

# Type alias export
(export_statement
  declaration: (type_alias_declaration
    name: (type_identifier) @type_name))

# Enum export
(export_statement
  declaration: (enum_declaration
    name: (identifier) @enum_name
    body: (enum_body) @enum_body))

# Const export
(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @var_name
      type: (type_annotation)? @var_type)))

# Express route
(call_expression
  function: (member_expression
    object: (identifier) @router_obj
    property: (property_identifier) @http_method)
  arguments: (arguments
    (string) @route_path))
```

## Verification Plan

1. Run against `logoslens` (Astro + React) — verify structure, exports, types
2. Run against `courtscribe` (VS Code extension) — verify TypeScript extraction
3. Run against `page-save` (Node CLI) — verify small project output
4. Run against `OEB-Ministry` (Next.js + Prisma) — verify routes, schema, components
5. Test `npx claude-code-map` from a clean directory (no global install)
6. Test cache: run twice, verify second run is faster and output identical
