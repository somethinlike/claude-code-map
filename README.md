# claude-code-map

Pre-index your codebase so Claude Code skips the exploration phase.

Every Claude Code conversation starts with structural exploration: "What routes exist? What does lib/ export? What's in the schema?" On larger projects, this costs 10-20 tool calls and significant token overhead before any real work begins. This tool generates compact markdown index files from tree-sitter AST parsing so Claude already knows the map when the conversation starts.

Built with care by [The Open English Bible Ministry](https://oebministry.org).

*"'You shall love the Lord your God with all your heart and with all your soul and with all your mind.' This is the greatest and first commandment. And a second is like it: 'You shall love your neighbor as yourself.'"* -- Matthew 22:37-39 (NRSVue)

## Install

```bash
npx claude-code-map
```

No global install needed. Runs once, generates index files, done.

## What It Does

Scans your project using tree-sitter AST parsing and generates compact markdown files in `.codemap/`:

| File | Contents |
|------|----------|
| `structure.md` | Annotated file tree with framework detection |
| `exports.md` | All exported functions, classes, types with signatures |
| `routes.md` | HTTP routes with methods and auth tags |
| `schema.md` | Database schema (Prisma, Django, etc.) |
| `types.md` | Interfaces, enums, type aliases with fields |
| `graph.md` | Import dependency graph, hot files ranking, external deps |
| `audit.md` | Passive code audit — structural AI-smell detection, ranked by severity × import heat |

Then add one line to your `CLAUDE.md`:

```
Read the .codemap/ directory for project structure before exploring files.
```

Every future conversation skips the exploration phase entirely.

## Languages

TypeScript, JavaScript, TSX, JSX, Python, Go, Rust, Java, C#, PHP, Ruby, Kotlin

## Frameworks

Auto-detected: Next.js (App + Pages Router), Astro, Express, Fastify, Django, Flask

## Options

```bash
npx claude-code-map                          # Scan current directory
npx claude-code-map --output .ai-index       # Custom output dir
npx claude-code-map --include src lib         # Only scan these dirs
npx claude-code-map --exclude "*.test.ts"     # Skip patterns
npx claude-code-map --schema prisma/schema.prisma  # Explicit schema
npx claude-code-map --force                   # Ignore cache, full re-scan
npx claude-code-map --hook                   # Install git pre-commit hook
npx claude-code-map --stats                  # Show index file sizes & token estimate
npx claude-code-map --quiet                  # Silent mode (for hooks/CI)
npx claude-code-map @UserService             # Look up a symbol in the index
npx claude-code-map --blast src/types.ts     # Show blast radius (what depends on this file)
```

## Keeping the Index Fresh

The most common concern: "How do you keep it from getting stale?"

Install a git pre-commit hook that auto-regenerates the index on every commit:

```bash
npx claude-code-map --hook
```

This appends a stanza to `.git/hooks/pre-commit` that runs `claude-code-map` and stages the output. Takes under a second, runs invisibly. Your index is always as fresh as your last commit.

## Symbol Lookup

Query the index without opening a conversation:

```bash
npx claude-code-map @UserService
```

Searches all indexed symbols and types by name (case-insensitive substring match). Useful for quick "where is this?" lookups.

## Token Stats

See how much your index costs and saves:

```bash
npx claude-code-map --stats
```

```
  .codemap/ index stats:
  ─────────────────────────────────────────────
  exports.md             9.4 KB   ~2,740 tokens
  structure.md            893 B   ~256 tokens
  types.md               4.4 KB   ~1,300 tokens
  ─────────────────────────────────────────────
  Total                 14.7 KB   ~4,296 tokens
```

## Dependency Graph

V2.0 builds a full import dependency graph from tree-sitter AST extraction across all 12 languages. The graph tracks which files import which, resolving relative paths to actual project files.

The `.codemap/graph.md` output includes:

- **Hot Files** -- files ranked by in-degree (number of dependents). The most-imported files in your project, sorted by impact.
- **External Dependencies** -- third-party and Node built-in imports aggregated across the project.

### Blast Radius

See what breaks when you change a file:

```bash
npx claude-code-map --blast src/types.ts
```

```
Blast radius for src/types.ts (3 hops):

Hop 1 (direct dependents):
  src/parser.ts
  src/scanner.ts
  src/cache.ts
  src/cli.ts

Hop 2:
  src/extractors/exports.ts
  src/extractors/routes.ts

Hop 3:
  src/formatters/exports-md.ts
```

This traverses the reverse dependency graph via BFS up to 3 hops. Useful for estimating the impact of a refactor before you start.

## Passive Code Audit

Most AI-coding failure modes are *structural*: junk drawers, monoliths, circular dependencies, type sprawl, incomplete refactors. These are detectable from the export set and import graph alone — no source reading needed. Since `claude-code-map` already has that data, it runs a passive audit on every index pass and writes the findings to `.codemap/audit.md`.

The audit is **opinion-forming, not a linter**. False positives are expected. Treat each finding as "look here first" — a ranked list of structural red flags that give Claude (or you) a prioritized audit target list.

Ten rules run automatically:

| Rule | What it catches | Severity |
|---|---|---|
| `junk-drawer` | `utils.ts` / `helpers.ts` / `shared.ts` with 5+ exports across unrelated domains | critical/high/medium |
| `monolith` | Single file with 15+ top-level exports (type-only files exempted) | critical/high |
| `circular-dependency` | Tarjan's SCC finds a cycle in the import graph | critical |
| `layer-violation` | `lib/`, `data/`, `db/` importing from `pages/`, `components/`, `app/` | high |
| `duplicated-domain` | Same exported symbol name declared in 2+ files | high |
| `type-sprawl` | 3+ variants of the same root type (`User`, `UserData`, `IUser`, `UserDto`) | high |
| `legacy-marker` | Exports or paths matching `_old`, `_legacy`, `_v1`, `_deprecated`, `_backup` | high |
| `unused-export` | File exports symbols but nothing imports it, and it's not an entry point | medium |
| `dead-file` | Zero imports in, zero out, not an entry point | medium |
| `naming-inconsistency` | File mixes camelCase and snake_case exports (2+ of each) | low |

Findings are ranked by **severity × import heat** — a medium issue in a file imported by 50 others outranks a high issue in a file nobody uses. The `audit.md` output leads with a Top Priority table, then groups all findings by severity for deeper review.

Entry points (`cli.ts`, `main.ts`, `index.ts`, `*.config.ts`, etc.) are exempted from the dead-file and unused-export rules. Type-only files are exempted from the monolith rule.

## Delta-Aware Caching

On subsequent runs, only changed files are re-parsed. A cache file tracks modification times and file sizes. Use `--force` to bypass.

## Config File

Create `codemap.config.json` in your project root:

```json
{
  "include": ["src", "lib"],
  "exclude": ["**/*.test.ts"],
  "output": ".codemap",
  "schema": ["prisma/schema.prisma"]
}
```

## How It Works

1. Detects your framework (Next.js, Astro, Express, etc.)
2. Scans source files, respecting include/exclude patterns
3. Parses each file with web-tree-sitter (WASM-based, no native deps)
4. Extracts exports, types, routes, and schema using AST queries
5. Formats results as compact markdown with smart collapsing
6. Writes to `.codemap/` with a cache for fast subsequent runs

## Gitignore Support

The scanner automatically reads your `.gitignore` and excludes matching directories. No configuration needed — `dist/`, `build/`, `.env`, and any custom directories in your `.gitignore` are skipped.

## Why Tree-sitter?

Unlike regex-based tools, tree-sitter builds a real AST. It handles multi-line declarations, nested generics, decorators, and non-standard formatting correctly. The WASM build means no C compiler or node-gyp needed -- `npx` just works.

## Token Savings

The actual savings depend on your project size. On a 21-file TypeScript project, the `.codemap/` output totals ~11KB across 4 files (~2,800 tokens). On a 150+ file project with hundreds of routes, it replaces what would otherwise be 10-15 file-reading tool calls at conversation start. The `graph.md` file adds the import dependency graph and hot files ranking -- information that would otherwise require Claude to trace imports across dozens of files.

The `.codemap/` files are stable between sessions, which makes them candidates for Claude API prompt caching (cached input tokens cost 90% less). Pre-indexing reduces how many tokens are loaded; caching reduces what each loaded token costs.

Run `--stats` to see your actual index size and estimated token count. The best way to measure real savings: start a conversation with and without the index files, and compare how many tool calls Claude makes before your first real question.

## License

CC0 1.0 — Public Domain. Do whatever you want with it.
