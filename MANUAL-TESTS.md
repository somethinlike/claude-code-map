# claude-code-map -- Manual Test Guide
**Updated:** 2026.04.02

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

---

## 7. Error Cases

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

## 8. Real Project Tests

### 8.1 page-save (Node CLI)
- [ ] Run against `C:\Users\somet\Projects\page-save`
- [ ] Detects Generic framework
- [ ] Extracts exports from server.ts, types.ts, file-writer.ts

### 8.2 logoslens (Astro + React)
- [ ] Run against `C:\Users\somet\Projects\logoslens`
- [ ] Detects Astro framework
- [ ] Extracts exports and types

### 8.3 OEB-Ministry (Next.js + Prisma)
- [ ] Run against `C:\Users\somet\Projects\OEB-Ministry`
- [ ] Detects Next.js framework
- [ ] Generates routes.md and schema.md
