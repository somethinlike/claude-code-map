# claude-code-map -- Manual Test Guide
**Updated:** 2026.04.10

## Prerequisites
- Node >= 20
- npm installed
- Run `npm install` in project root first

---

## 1. Basic Execution

### 1.1 Help Text
- [ ] Run `npx claude-code-map --help` -- should print usage info
- [ ] Exit code 0

### 1.2 Version
- [ ] Run `npx claude-code-map --version` -- should print calendar version
- [ ] Exit code 0

### 1.3 Default Scan
- [ ] Run `npx claude-code-map` in a TypeScript project
- [ ] `.codemap/` directory created
- [ ] `structure.md`, `exports.md`, `types.md` files present
- [ ] No crash, clean exit

---

## 2. Framework Detection

### 2.1 Next.js App Router
- [ ] Run in a Next.js project with `app/` directory
- [ ] Output says "Framework: Next.js (App Router)"
- [ ] `routes.md` generated with API routes

### 2.2 Astro
- [ ] Run in an Astro project
- [ ] Output says "Framework: Astro"

### 2.3 Express
- [ ] Run in a project with express in package.json
- [ ] Output says "Framework: Express"

### 2.4 Generic Fallback
- [ ] Run in a plain TypeScript project
- [ ] Output says "Framework: Generic"

---

## 3. Output Quality

### 3.1 Structure
- [ ] `structure.md` shows box-drawing file tree
- [ ] Framework name and language list in header
- [ ] Large directories collapse (5+ files shows "...N more")

### 3.2 Exports
- [ ] `exports.md` shows exported functions with signatures
- [ ] Files with 4+ exports truncate to top 4 + "+N more"
- [ ] Table format: Export | Kind | Signature

### 3.3 Types
- [ ] `types.md` shows interfaces with field tables
- [ ] Enums shown inline: `MEMBER1 | MEMBER2`
- [ ] Interfaces with 6+ fields truncate

### 3.4 Routes (if applicable)
- [ ] `routes.md` shows HTTP methods and paths
- [ ] Auth detection flags routes with auth middleware
- [ ] Route groups with 5+ routes collapse

### 3.5 Schema (if applicable)
- [ ] `schema.md` shows models with fields and types
- [ ] Audit fields (createdAt, updatedAt) skipped
- [ ] Simple models use compact single-line format

### 3.6 Audit (`.codemap/audit.md`)
- [ ] File generated automatically on every index pass (no flag needed)
- [ ] Header shows files analyzed, rules run, total findings, severity breakdown
- [ ] "Top Priority" table ranks findings by score (severity × heat)
- [ ] Findings grouped under Critical / High / Medium / Low sections
- [ ] Each finding shows file path, title, signals, action, and `[hot: N]` suffix when imported
- [ ] CLI summary line prints: `audit: N findings (C critical, H high, M medium, L low)`
- [ ] File is NOT generated when there are zero findings (clean codebases)
- [ ] Stale `audit.md` is **removed** when findings drop to zero on a re-run (idempotent — reruns on a clean codebase don't error if the file is already absent)

#### 3.6.1 Junk Drawer Detection
- [ ] Create `src/utils.ts` with 10+ exported functions across unrelated domains
- [ ] Run index; junk-drawer finding should fire, severity `high`
- [ ] Add 5 more exports (15 total); severity escalates to `critical`
- [ ] Delete exports down to 2; finding disappears entirely

#### 3.6.2 Monolith Detection
- [ ] Create a non-utils file with 16+ exported functions
- [ ] Run index; monolith finding fires at `high`
- [ ] Add 10 more exports (26 total); severity escalates to `critical`
- [ ] Create `src/types.ts` with only interfaces/types; should NOT flag as monolith (type-only exemption)

#### 3.6.3 Circular Dependency Detection
- [ ] Create `a.ts` imports `b.ts` imports `a.ts`
- [ ] Run index; `circular-dependency` finding fires at `critical`
- [ ] Cycle text shows both files in sequence

#### 3.6.4 Layer Violation
- [ ] Create `src/lib/helper.ts` that imports from `src/pages/home.tsx`
- [ ] Run index; `layer-violation` finding fires at `high`
- [ ] Reverse the direction (pages imports lib) — no finding

#### 3.6.5 Duplicated Domain
- [ ] Export `validateSession` from two different files
- [ ] Run index; `duplicated-domain` finding fires at `high`
- [ ] Rename one; finding disappears
- [ ] Common symbols like `GET`, `loader`, `init`, `run` should NOT trigger the rule

#### 3.6.6 Type Sprawl
- [ ] Declare `User`, `UserData`, `UserInfo` in one or more files
- [ ] Run index; `type-sprawl` finding fires with root name `User` and 3 variants listed
- [ ] `IUser` also counts (leading `I` stripped for normalization)
- [ ] Only 2 variants → no finding

#### 3.6.7 Legacy Markers
- [ ] Rename a file to `parser_v1.ts` → finding fires
- [ ] Add an exported function named `parseOld_v1` → finding fires in its host file
- [ ] Files under `legacy/` directories also flag

#### 3.6.8 Dead File / Unused Export
- [ ] Create `src/orphan.ts` with one export, no imports in or out → `dead-file` finding (medium)
- [ ] Create `src/orphan2.ts` that imports something but nothing imports it → `unused-export` finding (medium)
- [ ] Entry points (`cli.ts`, `main.ts`, `index.ts`, `*.config.ts`) should NOT flag

#### 3.6.9 Naming Inconsistency
- [ ] Create a file with 2 camelCase exports AND 2 snake_case exports → low-severity finding
- [ ] All camelCase: no finding
- [ ] PascalCase classes and UPPER_SNAKE constants are ignored in the count

#### 3.6.10 Scoring Behavior
- [ ] Run audit on a codebase with both a critical (cold) finding and a high (hot, imported 5x) finding
- [ ] Critical should still rank first (severity dominates at low hotness)
- [ ] Create a medium-severity finding in a file imported by 50+ others — it should rank above a cold high (heat promotion by design)

---

## 4. Cache

### 4.1 Initial Run
- [ ] First run creates `cache.json` and `cache-data.json` in output dir
- [ ] All files marked as "changed"

### 4.2 Cached Run
- [ ] Second run (no changes) says "All files unchanged"
- [ ] Completes nearly instantly

### 4.3 Force Flag
- [ ] Run with `--force` -- re-parses all files
- [ ] Output matches initial run

### 4.4 Changed File
- [ ] Modify a source file, run again
- [ ] Only modified file re-parsed (check "N changed files" message)

---

## 5. Config File

### 5.1 Include Dirs
- [ ] Create `codemap.config.json` with `"include": ["src"]`
- [ ] Only `src/` files appear in output

### 5.2 Exclude Patterns
- [ ] Add `"exclude": ["**/*.test.ts"]`
- [ ] Test files excluded from output

### 5.3 Custom Output
- [ ] Set `"output": ".ai-index"`
- [ ] Files written to `.ai-index/` instead of `.codemap/`

---

## 6. CLI Flags

### 6.1 --output
- [ ] `--output .my-index` writes to that directory

### 6.2 --include
- [ ] `--include src` scans only src/

### 6.3 --exclude
- [ ] `--exclude "*.test.ts"` skips test files

### 6.4 --schema
- [ ] `--schema prisma/schema.prisma` forces schema extraction

### 6.5 --stats
- [ ] Run `--stats` after a successful scan
- [ ] Shows table with file sizes, estimated token counts, and total
- [ ] Run `--stats` with no existing index → "No index found" message

### 6.6 --quiet / -q
- [ ] Run with `--quiet` → produces zero stdout output
- [ ] Exit code still 0 on success
- [ ] `-q` works as short alias

### 6.7 --hook (pre-commit)
- [ ] Run `--hook` → installs pre-commit hook
- [ ] Hook uses `--quiet` and `|| true` (never blocks commits)
- [ ] Make a commit → hook runs silently, .codemap/ staged automatically
- [ ] If hook fails (e.g., node not available), commit still succeeds

---

## 7. Language Support

### 7.1 TypeScript / JavaScript / TSX / JSX
- [ ] Exports: functions, classes, interfaces, types, enums, constants
- [ ] Types: interfaces with fields, enums, type aliases
- [ ] Routes: Express/Fastify `app.get()` etc.

### 7.2 Python
- [ ] Functions, classes, decorated functions
- [ ] Class fields from type annotations
- [ ] Flask routes, Django URL patterns

### 7.3 Go
- [ ] Functions, methods with receivers
- [ ] Structs, interfaces
- [ ] HTTP router methods

### 7.4 Rust
- [ ] `pub` functions
- [ ] Structs, enums, traits

### 7.5 Java
- [ ] Classes, public methods
- [ ] Spring Boot routes (@GetMapping with path, bare @GetMapping, class-level @RequestMapping prefix)

### 7.6 C#
- [ ] Classes, public methods
- [ ] Modifier detection (public/static without cross-product duplication)

### 7.7 PHP
- [ ] Functions, classes, interfaces, traits, enums (PHP 8.1+)
- [ ] Public methods extracted from classes
- [ ] Laravel routes (`Route::get()` etc.)

### 7.8 Ruby
- [ ] Methods, classes, modules, singleton methods (self.method)
- [ ] attr_accessor/attr_reader/attr_writer as fields
- [ ] Rails routes from routes.rb

### 7.9 Kotlin
- [ ] Functions, classes, objects
- [ ] Interface properties and functions
- [ ] Spring Boot routes (same annotation patterns as Java)

---

## 8. Error Cases

### 7.1 Empty Directory
- [ ] Run in a directory with no supported files
- [ ] Shows "No supported source files found"
- [ ] Clean exit, no crash

### 7.2 Syntax Errors in Source
- [ ] Run in a project with a malformed .ts file
- [ ] Warning printed, file skipped, other files processed normally

### 7.3 Unknown Flag
- [ ] Run with `--bogus` flag
- [ ] Error message, exit code 1

---

## 9. Dependency Graph

### 9.1 Graph Generation
- [ ] Run `npx claude-code-map --force` in a multi-file TypeScript project
- [ ] `.codemap/graph.md` file is generated alongside the other output files
- [ ] File contains a "Hot Files" table with columns: File, Dependents
- [ ] Hot files are sorted by dependent count (highest first)
- [ ] Rankings look sensible (shared types/utils files near the top)

### 9.2 External Dependencies
- [ ] `graph.md` contains an "External Dependencies" section
- [ ] Node built-ins listed (e.g., `node:fs`, `node:path`)
- [ ] Third-party packages listed (e.g., `web-tree-sitter`)

### 9.3 Blast Radius -- High-Impact File
- [ ] Run `npx claude-code-map --blast src/types.ts`
- [ ] Output shows "Blast radius for src/types.ts"
- [ ] Lists dependent files grouped by hop (Hop 1, Hop 2, Hop 3)
- [ ] Hop 1 contains direct importers of types.ts
- [ ] Hop count does not exceed 3

### 9.4 Blast Radius -- Leaf File
- [ ] Run `--blast` on a file that nothing imports (e.g., a formatter or test file)
- [ ] Output shows few or no dependents
- [ ] Clean exit, no crash

### 9.5 Blast Radius -- Nonexistent File
- [ ] Run `--blast src/does-not-exist.ts`
- [ ] Graceful error message, not a stack trace
- [ ] Exit code 1

### 9.6 Re-Exports Captured as Edges (V2.0.4)
- [ ] Create a barrel file `src/index.ts` containing only `export * from './foo.ts'` and `export * from './bar.ts'` (with foo.ts and bar.ts existing in the same directory)
- [ ] Run `npx claude-code-map --force`
- [ ] `graph.md` shows `src/index.ts` with `Imports: 2` (not 0)
- [ ] Run `--blast src/foo.ts` and verify `src/index.ts` appears in the dependents list (the re-export edge is followed)
- [ ] Repeat with `export { Foo } from './foo.ts'` (named re-export) — same result
- [ ] Repeat with `export type * from './foo.ts'` (type-only re-export) — same result
- [ ] Verify re-export is NOT counted as an export of the barrel itself: `exports.md` for `src/index.ts` should be empty (the barrel forwards but doesn't declare)

---

## 10. Real Project Tests

### 10.1 page-save (Node CLI)
- [ ] Run against `C:\Users\somet\Projects\page-save`
- [ ] Detects Generic framework
- [ ] Extracts exports from server.ts, types.ts, file-writer.ts

### 10.2 logoslens (Astro + React)
- [ ] Run against `C:\Users\somet\Projects\logoslens`
- [ ] Detects Astro framework
- [ ] Extracts exports and types

### 10.3 OEB-Ministry (Next.js + Prisma)
- [ ] Run against `C:\Users\somet\Projects\OEB-Ministry`
- [ ] Detects Next.js framework
- [ ] Generates routes.md and schema.md
