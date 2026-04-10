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
- 153-test suite (19 test files)
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
│   │   ├── imports.ts          # Import extraction dispatcher + resolver
│   │   ├── routes.ts           # Extract HTTP routes (file-based + code-based)
│   │   ├── schema.ts           # Extract DB schema (Prisma, Django, etc.)
│   │   └── types.ts            # Extract interfaces/enums/type aliases
│   ├── graph.ts                # Graph construction, BFS blast radius, hot files ranking
│   └── formatters/
│       ├── structure-md.ts     # → .codemap/structure.md
│       ├── exports-md.ts       # → .codemap/exports.md
│       ├── graph-md.ts         # → .codemap/graph.md
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
- **graph.md** — import dependency graph, hot files ranking, external deps

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
- [x] **109 tests** across 16 test files (now 153/19 after V2.0)

## V2 Scope — Import Graph, MCP Server, and Competitive Parity

Driven by competitive analysis of codesight (see Competitive Landscape above). V2 closes the feature gap while preserving our AST correctness advantage.

### V2.0: Import Graph & Blast Radius (npm 2.0.0)

The foundational release. Import graph is a prerequisite for blast radius, hot files, and MCP server tools.

**Features:**
- [x] Import extraction via tree-sitter queries for all 12 languages
- [x] Import resolution (raw specifier → project-relative path)
- [x] Dependency graph construction (adjacency + reverse adjacency)
- [x] Hot files ranking (sorted by in-degree / number of dependents)
- [x] Blast radius computation (BFS through reverse edges)
- [x] New output: `.codemap/graph.md` with hot files table + external deps summary
- [x] New CLI flag: `--blast <file>` prints blast radius to stdout
- [x] Cache integration: store imports in `cache-data.json`, bump cache version

**New files:** `src/extractors/imports.ts`, `src/graph.ts`, `src/formatters/graph-md.ts` + tests
**Modified files:** `src/types.ts`, `src/cli.ts`, `src/cache.ts`, all 9 `src/queries/*.ts` files
**New types:** `ExtractedImport`, `ImportEdge`, `ImportGraph`, `HotFile`, `BlastRadius`
**Dependencies:** None (pure in-memory graph)
**Test count:** 153 tests across 19 test files

### V2.0.2: Passive Code Audit (npm 2.0.2)

Insight: the index already contains ~90% of what's needed to flag common AI-coding smells. Most AI failure modes are *structural* (junk drawers, monoliths, circular deps, type sprawl, legacy leftovers) — all detectable from the export set + import graph with zero source-reading. Rather than building a separate linter, bolt an opinion-forming pass onto the existing pipeline and emit `.codemap/audit.md` as another byproduct.

**Design principles:**
- **Passive** — runs automatically during every index pass, no new CLI flag needed
- **Ranked by heat** — severity × `log10` of import count, so hot files surface first
- **Opinion-forming, not a linter** — false positives expected; each finding is "look here first", not a verdict
- **No new data extraction** — rules operate exclusively on data already collected

**Features:**
- [x] 10 audit rules: junk-drawer, monolith, circular-dependency, layer-violation, duplicated-domain, type-sprawl, legacy-marker, unused-export, dead-file, naming-inconsistency
- [x] Heat-weighted scoring: severity dominates at low hotness, extreme hotness can promote across tiers
- [x] Tarjan's SCC algorithm for circular dependency detection
- [x] Entry-point exemption list (cli/main/index/config files exempt from dead-file rules)
- [x] Type-only file exemption for monolith rule (types barrels are fine)
- [x] `.codemap/audit.md` output with Top Priority table + findings grouped by severity
- [x] Summary line in CLI output: `audit: N findings (critical/high/medium/low)`

**Rule details:**
| Rule | Trigger | Severity |
|---|---|---|
| `junk-drawer` | filename matches `utils\|helpers\|lib\|misc\|common\|shared` AND exports ≥ 5 | critical if ≥ 15, high if ≥ 8, medium otherwise |
| `monolith` | exports ≥ 15 (excluding type-only files and junk drawers) | critical if ≥ 25, high otherwise |
| `circular-dependency` | Tarjan's SCC finds a cycle in the import graph | critical |
| `layer-violation` | `lib/data/db/models/services` imports from `pages/app/components/views/routes` | high |
| `duplicated-domain` | same exported symbol name in 2+ files (skips framework conventions like `GET`, `loader`) | high |
| `type-sprawl` | 3+ variants of same root type name (`User`, `UserData`, `IUser`, `UserDto`) | high |
| `legacy-marker` | file path or export name matches `_old\|_legacy\|_v1\|_v2\|_deprecated\|_backup` | high |
| `unused-export` | file exports symbols but has 0 incoming edges, not an entry point | medium |
| `dead-file` | 0 in-edges AND 0 out-edges AND not an entry point | medium |
| `naming-inconsistency` | ≥ 2 camelCase AND ≥ 2 snake_case exports in one file | low |

**New files:** `src/audit.ts`, `src/audit.test.ts`, `src/formatters/audit-md.ts`, `src/formatters/audit-md.test.ts`
**Modified files:** `src/types.ts` (added audit types + `AUDIT_ENTRY_POINT_PATTERNS`), `src/cli.ts` (pipeline integration)
**New types:** `AuditSeverity`, `AuditRuleId`, `AuditFinding`, `AuditReport`
**Dependencies:** None (pure in-memory analysis)
**Test count:** 218 tests across 22 test files (65 new)

### V2.0.3: Eat Our Own Dog Food — types.ts Decomposition

The first thing the V2.0.2 audit feature found when run against this project was its own `src/types.ts` — a 352-line "monolith" with 33 top-level exports across 13 domains, imported by 30+ files. The architecture rule says "one module per domain"; types.ts violated that for every concept in the project. Fixing it both resolves the only critical finding and demonstrates that the tool's recommendations apply to itself.

**Changes:**
- [x] **Decomposed `src/types.ts` into 13 per-domain files** under `src/types/` (`languages.ts`, `symbols.ts`, `routes.ts`, `schema.ts`, `extracted-types.ts`, `frameworks.ts`, `files.ts`, `imports.ts`, `graph.ts`, `parsed.ts`, `audit.ts`, `cache.ts`, `config.ts`)
- [x] **`src/types.ts` is now a 13-line `export *` barrel** preserving the public API exactly. Zero consumer churn — all 41 import sites continue to resolve unchanged because the tree-sitter export queries require an `export_statement` with a `declaration` child, so re-export statements are invisible to the extractor and the barrel registers as zero exports. The monolith finding disappears naturally.
- [x] **Renamed `AUDIT_SKIP_FIELDS` → `ORM_AUDIT_COLUMNS`**: the old name implied the audit rule skipped these fields, but the constant is consumed by the schema extractor to skip ORM-managed audit columns (createdAt/updatedAt/etc.) when listing user-defined fields.
- [x] **Renamed `src/extractors/types.ts` → `src/extractors/type-info.ts`**: avoids the path-stem collision with the new `src/types/` directory.
- [x] **`WASM_FILE_MAP` typed as `Partial<Record<SupportedLanguage,string>>`** because astro has no tree-sitter grammar (it uses regex frontmatter extraction and is routed through a separate branch in `cli.ts`). `parser.ts` gets a runtime guard.
- [x] **Deleted dead `GRAMMAR_LANGUAGE_MAP`** — declared in types.ts, referenced nowhere.
- [x] **`AUDIT_ENTRY_POINT_PATTERNS` regex extended** from `types\.(ts|d\.ts)$` to `types(\.ts|\/)` so the whole declarative type zone is exempt from dead-file/unused-export rules.
- [x] **`cli.ts` removes stale `audit.md`** when findings drop to zero, instead of leaving the previous report on disk for consumers to read. Bug exposed by this very refactor.

**New finding:** the import graph extractor also fails to count `export * from './x.ts'` as an import edge — the import queries operate on `import_statement` nodes, not `export_statement`. The barrel's links to its per-domain files are invisible to the graph. (Fixed in V2.0.4.)

**Verification:** typecheck clean (was 4 pre-existing errors), 218/218 tests pass, audit produces 0 findings.

### V2.0.4: Fix Re-Export Graph Blindness (npm 2.0.4)

A bug surfaced by the V2.0.3 decomposition: the TypeScript import extractor's tree-sitter queries matched `import_statement` nodes only, so `export * from './x.ts'` and `export { Foo } from './x.ts'` re-exports never registered as edges in the dependency graph. Barrel files appeared to import nothing — the links from `src/types.ts` to its 13 per-domain files were invisible to `graph.md` and to blast-radius analysis.

This is the same shape of AST-query bug as the Java `annotation` vs `marker_annotation` lesson in V1.1: tree-sitter queries are subtree shape matchers, not concept matchers. A query for "all imports" has to enumerate every grammar production that participates in the concept, not just the obvious one.

**Changes:**
- [x] **`EXPORT_FROM_QUERY`** added to `src/queries/typescript.ts`. Matches `(export_statement source: (string) @import_source)` — captures wildcard re-exports (`export * from`), named re-exports (`export { Foo } from`), and type-only re-exports (`export type * from`).
- [x] **`extractTsImports`** runs the new query alongside the three existing import queries (ES imports, `require()`, dynamic `import()`). The dedup `Set` already handles overlap with regular imports.
- [x] **`parseSource(source, language)`** helper extracted from `parseFile` in `src/parser.ts` so tests can parse in-memory strings without writing temp files. `parseFile` is now a thin wrapper around `parseSource` + `readFileSync`.
- [x] **8 new tests** in `src/queries/typescript.test.ts` covering all re-export forms: wildcard, named, aliased, type-only, dedup with regular imports, external bare specifiers. Plus 2 regression tests confirming the audit's intentional blindness — `extractTsExports` still returns 0 for re-export-only files (the property that makes barrel files invisible to the monolith rule).

**Impact on the codemap of the project itself:**
- Internal edges: 117 → 130 (+13, exactly matching the 13 `export *` lines in `src/types.ts`)
- Files with imports: 41 → 47 (+6, the 13 per-domain type files now correctly show their internal cross-references)
- `src/types.ts` graph row: `30 | 0` → `30 | 13` (the barrel now correctly reports its 13 outgoing dependencies)

**Verification:** typecheck clean, 226/226 tests pass (218 + 8 new), audit still 0 findings.

**Out of scope:** the equivalent fix for Rust (`pub use crate::module::Foo`) and any other languages with re-export idioms. Filed as future work; TypeScript was the surfaced bug because of how common barrel files are in TS projects.

### V2.1.0: Route Extraction Hardening (npm 2.1.0)

First Tier 1 RealWorld benchmark sweep surfaced that route extraction was broken across 7 of 11 frameworks. V2.1.0 fixes 8 distinct extractor bugs and adds two new extractors (C#, Rust). Coverage went from 4 working frameworks to 9.

**Bugs fixed:**
- [x] **PHP query syntax error** — used `member_call_expression` (instance call) instead of `scoped_call_expression` (Class::method). Crashed every PHP scan.
- [x] **PHP single vs double quoted strings** — single-quoted (`'foo'`) parses as `string`, double-quoted (`"foo"`) as `encapsed_string`. Query now alternation-matches both.
- [x] **Go HTTP method case sensitivity** — Gin uses `router.GET("/path")` (uppercase). The Go HTTP_METHODS set was title-case. Now case-insensitive.
- [x] **Python Django old `url()` form** — only `path()`/`re_path()` were matched. Older Django codebases (and the RealWorld sample) use `url(r'^foo$', view)`. Added `url` to recognized URL functions.
- [x] **Kotlin Spring annotation wrapper** — Kotlin annotations with arguments wrap content in `constructor_invocation`, not directly in `annotation`. Java grammar doesn't have this wrapper. Added the missing layer.
- [x] **Java Spring named-argument annotations** — `@RequestMapping(path = "/foo")` and `@PostMapping(value = "/bar")` use `element_value_pair`, not direct string children. Added a separate query for the named-arg form. Also fixed class-level prefix detection.
- [x] **TypeScript Express same-line constraint** — the path lookup required `route_path.startRow === router_obj.startRow`. Multi-line router declarations (path on its own line) were silently dropped. Removed the constraint.

**New extractors:**
- [x] **C# ASP.NET Core** — three queries (`[HttpGet("path")]`, bare `[HttpGet]`, class-level `[Route("base")]`) plus `extractCsharpRoutes()` with prefix joining.
- [x] **Rust Axum + Actix** — `.route("/path", verb(handler))` chained on `Router::new()` (axum) and `#[get("/path")]` attribute macros (actix). Includes the qualified verb form `routing::post(handler)`.

**New tests:** `src/queries/routes.test.ts` — 19 integration tests via `parseSource()`. Test count 226 → 245.

**Coverage results** (Tier 1 RealWorld sweep):

| Framework | Before | After |
|---|---|---|
| TypeScript Express | 8/20 (40%) | **20/20 (100%)** |
| Python Django | 0/19 (0%) | **15/19 (79%)** |
| Python Flask | 23/23 (100%) | 23/23 (100%) |
| Go Gin | 0/26 (0%) | **31/26 (100%+)** |
| Rust Actix | 0 | 0 (macros, future work) |
| Rust Axum | 0/12 (0%) | **6/12 (50%)** |
| Java Spring | 13/19 (68%) | **19/19 (100%)** |
| Kotlin Spring | 0/19 (0%) | **19/19 (100%)** |
| C# ASP.NET | 0/19 (0%) | **19/19 (100%)** |
| Ruby Rails | 0 | 0 (resources DSL, future work) |
| PHP Laravel | 0 (CRASH) | **11/12 (92%)** |

Frameworks with working route extraction: 4 → **9 of 11**. Total routes captured: ~74 → ~163 (+121%).

Full benchmark notes in `BENCHMARKS.md` Results Log section.

**Known gaps deferred:**
- Ruby Rails `resources :articles` DSL (would need path synthesis from a 7-route REST template)
- Rust Actix `register_service!` macro routes (tree-sitter doesn't expand macros)
- Rust Axum chained verb methods (`get(h).put(h2)` → only `get` captured)
- Go false positives (~5/26 in gin benchmark — broad `(method) call_expression` matching)
- Schema extraction for non-Prisma ORMs (Django, Rails AR, Eloquent, JPA, EF, sqlx) — still 0 models on every benchmark

### V2.1.1: Tier 2 Hardening — C# Resolver + Django Models (npm 2.1.1)

After the V2.1.0 Tier 1 sweep, ran selective Tier 2 audit on `healthchecks` (Django, 683 files) and `bitwarden-server` (C#, 4423 files). Two real bugs surfaced; both fixed in V2.1.1.

**Bugs fixed:**

- [x] **C# import resolver missed namespace prefixes.** Bitwarden uses `Bit.Core.X.Y` namespaces that map to `src/Core/X/Y/`. The leading `Bit` is the project root namespace, not a directory. The pre-V2.1.1 resolver looked for the literal `Bit/Core/X/Y` substring and found nothing — bitwarden's 4423-file codebase had only **4 import edges** in graph.md. The new resolver tries progressively shorter suffixes (`Bit/Core/X/Y` → `Core/X/Y` → `X/Y` → `Y`) until it finds a directory match. Two new tests cover the bitwarden-style pattern and a no-false-positives case.

- [x] **Django model extraction (first non-Prisma ORM).** Every Tier 1+2 Python benchmark had `0 models` because schema extraction only handled Prisma. Added `extractPyModels` plus a new per-language `extractModels()` dispatcher that runs alongside other per-file extractors. The Django extractor finds `class Foo(models.Model):` declarations, walks the class body for `field = models.X(...)` assignments, extracts field types and attributes (PK / UQ / FK), and detects nullability from `null=True`/`blank=True` arguments. Path-filters to `models.py` / `models/` directories. 7 new tests. Verified against healthchecks: **12/12 models extracted with full field definitions**.

**New types of work:**
- The `extractModels()` dispatcher in `src/extractors/schema.ts` parallels `extractRoutes()` etc. — each language can scan its own ORM idioms during the per-file parse loop. Future ORMs (SQLAlchemy, Peewee, JPA, EF, Eloquent, ActiveRecord) plug in here.

**Still deferred:**
- Bitwarden's 9-minute scan time at 4423 files — first-run perf is dominated by per-file tree-sitter + query overhead. Needs profiling.
- SQLAlchemy / Peewee model extraction — Django pattern doesn't match their declarative_base / Model shape.
- JPA, EF Core, ActiveRecord, Eloquent model extraction — each is its own ORM-specific extractor.

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
8. src/extractors/type-info.ts
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
