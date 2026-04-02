# claude-code-map

Pre-index your codebase so Claude Code skips the exploration phase.

Every Claude Code conversation starts the same way: 10-20 tool calls exploring your codebase, burning 30-50K tokens before any real work begins. This tool generates compact markdown index files from tree-sitter AST parsing so Claude already knows the map when the conversation starts.

Built with care by [The Open English Bible Ministry](https://oebministry.org).

*"'You shall love the Lord your God with all your heart and with all your soul and with all your mind.' This is the greatest and first commandment. And a second is like it: 'You shall love your neighbor as yourself.'"* -- Matthew 22:37-39 (NRSVue)

## Install

```bash
npx claude-code-map
```

No global install needed. Runs once, generates index files, done.

## What It Does

Scans your project using tree-sitter AST parsing and generates 5 compact markdown files in `.codemap/`:

| File | Contents |
|------|----------|
| `structure.md` | Annotated file tree with framework detection |
| `exports.md` | All exported functions, classes, types with signatures |
| `routes.md` | HTTP routes with methods and auth tags |
| `schema.md` | Database schema (Prisma, Django, etc.) |
| `types.md` | Interfaces, enums, type aliases with fields |

Then add one line to your `CLAUDE.md`:

```
Read the .codemap/ directory for project structure before exploring files.
```

Every future conversation skips the exploration phase entirely.

## Languages

TypeScript, JavaScript, TSX, JSX, Python, Go, Rust, Java, C#

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
```

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

## Why Tree-sitter?

Unlike regex-based tools, tree-sitter builds a real AST. It handles multi-line declarations, nested generics, decorators, and non-standard formatting correctly. The WASM build means no C compiler or node-gyp needed -- `npx` just works.

## License

CC0 1.0 — Public Domain. Do whatever you want with it.
