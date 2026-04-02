# claude-code-map — Roadmap & Implementation Plan

## Problem

Claude Code spends 30-50K tokens at the start of every conversation exploring project structure (routes, exports, schema, types). This is repeated work — the same structural discovery every time. `claude-code-map` solves this by generating static markdown index files from tree-sitter AST parsing. One `npx claude-code-map` call, one line in CLAUDE.md, and every future conversation starts with the map already in hand.

## Competitive Landscape

| Tool | Extraction | Languages | License | Gap |
|------|-----------|-----------|---------|-----|
| ai-codex | Regex | TS/JS only | MIT | Fragile, narrow |
| Cymbal | tree-sitter | 24 languages | **No license** | Can't legally use |
| TheBrain | Regex | 9 languages | **GPL-3.0** | Copyleft |
| jCodeMunch | tree-sitter | 35+ languages | **Paid commercial** | $79-$2,249 |

`claude-code-map` fills the gap: **MIT-licensed, tree-sitter AST, polyglot, zero-config, npx-ready.**

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

## V2 Scope (Future — Do Not Build Yet)

- Watch mode (`--watch`) with file system watcher for real-time re-indexing
- MCP server mode — native Claude tool integration, no Bash calls
- Pre-commit hook integration (`--hook` generates a git hook script)
- More languages: Kotlin, Swift, PHP, Ruby, Elixir, Dart
- Monorepo support (scan multiple packages, per-package output)
- `@symbol` lookup CLI command (query the index for a specific symbol)
- Configurable language subset (don't download all WASM grammars)

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
