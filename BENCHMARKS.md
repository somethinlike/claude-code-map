# claude-code-map Benchmark Projects

Curated repos for auditing extraction accuracy across all supported languages.
Clone into a temp directory and run `npx claude-code-map --force` against each, then manually verify output against the actual codebase.

## Audit Protocol

For each project:
1. `git clone <url> /tmp/bench/<name> --depth 1`
2. `cd /tmp/bench/<name> && npx claude-code-map --force`
3. Compare `.codemap/` output against reality:
   - **Routes:** Count actual HTTP endpoints vs detected routes. Check for false positives (Supabase, ORM calls misidentified as routes).
   - **Exports:** `grep -r "^export " src/ | wc -l` vs codemap's total. Spot-check 10 random exports for correct signatures.
   - **Types:** Verify interfaces/enums/type aliases are captured with correct fields.
   - **Graph:** Check hot files make sense. Verify blast radius on the #1 hot file.
   - **Imports:** Check a few files' imports in the codemap vs reality. Are relative imports resolved correctly?
   - **Framework detection:** Is the framework correctly identified?

---

## Tier 1: RealWorld (same app spec, every language)

The [RealWorld](https://github.com/gothinkster/realworld) project implements a Medium.com clone across dozens of languages/frameworks. Same API spec = consistent comparison baseline. These are small (~20-50 files) but have routes, types, auth, and DB models.

| Language | Framework | Repo | What to audit |
|----------|-----------|------|---------------|
| **TypeScript** | Express | [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app) | TS export/route extraction, Express route detection |
| **Python** | Django | [gothinkster/django-realworld-example-app](https://github.com/gothinkster/django-realworld-example-app) | Django route detection, Python import resolution |
| **Python** | Flask | [gothinkster/flask-realworld-example-app](https://github.com/gothinkster/flask-realworld-example-app) | Flask route decorators, Python type extraction |
| **Go** | Gin | [gothinkster/golang-gin-realworld-example-app](https://github.com/gothinkster/golang-gin-realworld-example-app) | Go struct extraction, import resolution via go.mod |
| **Rust** | Actix | [ryym/rust-actix-realworld-example-app](https://github.com/ryym/rust-actix-realworld-example-app) | Rust use/mod resolution, struct/enum extraction |
| **Rust** | Axum | [launchbadge/realworld-axum-sqlx](https://github.com/launchbadge/realworld-axum-sqlx) | Axum route extraction, SQLx model detection |
| **Java** | Spring Boot | [gothinkster/spring-boot-realworld-example-app](https://github.com/gothinkster/spring-boot-realworld-example-app) | Spring route annotations, JPA entity extraction |
| **Kotlin** | Spring | [gothinkster/kotlin-spring-realworld-example-app](https://github.com/gothinkster/kotlin-spring-realworld-example-app) | Kotlin Spring routes, class-level @RequestMapping prefix |
| **C#** | ASP.NET Core | [gothinkster/aspnetcore-realworld-example-app](https://github.com/gothinkster/aspnetcore-realworld-example-app) | [HttpGet]/[HttpPost] routes, Entity Framework DbSet<> |
| **Ruby** | Rails | [gothinkster/rails-realworld-example-app](https://github.com/gothinkster/rails-realworld-example-app) | Rails routes.rb extraction, ActiveRecord models |
| **PHP** | Laravel | [gothinkster/laravel-realworld-example-app](https://github.com/gothinkster/laravel-realworld-example-app) | Laravel route files, Eloquent models |

---

## Tier 2: Medium Real-World Projects (50-200 files)

More complex than RealWorld — multiple modules, real routing, schemas, and deep import graphs.

| Language | Framework | Repo | Stars | What to audit |
|----------|-----------|------|-------|---------------|
| **Python** | Django | [healthchecks/healthchecks](https://github.com/healthchecks/healthchecks) | 8.5k | Django urls.py route extraction, model detection, Python import graph across 100+ files |
| **TypeScript** | Next.js | [calcom/cal.com](https://github.com/calcom/cal.com) | 35k | Next.js App Router routes, monorepo workspace detection, massive TS type system |
| **Ruby** | Rails | [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | 22k | Rails routes, ActiveRecord, Ruby import resolution at scale |
| **PHP** | Laravel | [the-control-group/voyager](https://github.com/the-control-group/voyager) | 12k | Laravel route detection, Eloquent models, PHP namespace resolution |
| **Go** | Gin/Chi | [milvus-io/milvus](https://github.com/milvus-io/milvus) | 32k | Go import resolution in a large codebase, struct extraction |
| **Java** | Spring Boot | [macrozheng/mall](https://github.com/macrozheng/mall) | 78k | Spring Boot annotations at scale, JPA entities, deep package hierarchy |
| **C#** | ASP.NET | [bitwarden/server](https://github.com/bitwarden/server) | 16k | Large C# project, controller routes, Entity Framework, namespace resolution |
| **Kotlin** | Spring | [nickolasburr/kotlin-spring-boot-starter](https://github.com/gothinkster/kotlin-spring-realworld-example-app) | ~200 | (Use RealWorld above — not many medium Kotlin web projects exist) |

---

## Tier 3: Stress Tests (Large / Edge Cases)

Projects designed to surface scalability issues, unusual patterns, or framework edge cases.

| Language | Framework | Repo | Why it's a stress test |
|----------|-----------|------|----------------------|
| **TypeScript** | Astro | [withastro/docs](https://github.com/withastro/docs) | Large Astro project — tests our new .astro support with hundreds of pages |
| **TypeScript** | Astro | [withastro/starlight](https://github.com/withastro/starlight) | Astro documentation framework — .astro components + TS lib code |
| **Rust** | Mixed | [denoland/deno](https://github.com/denoland/deno) | Massive Rust codebase, deep module hierarchy, crate:: resolution |
| **Python** | Django | [sentry-org/sentry](https://github.com/getsentry/sentry) | Enormous Django project, tests import graph at 1000+ files |
| **Go** | Custom | [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes) | Extreme Go monorepo, tests scanner exclusion and graph performance |

---

## Audit Schedule

**Friday night sessions** — burn through weekly token allowance on these audits.

### Week 1: RealWorld suite (Tier 1)
Clone all 11 RealWorld repos, run claude-code-map against each, compare output.
Focus: extraction accuracy per language. Are routes found? Are types correct? Do imports resolve?

### Week 2: Medium projects (Tier 2)
Clone 3-4 Tier 2 projects (healthchecks, cal.com, chatwoot, voyager).
Focus: scale behavior. Does the graph make sense at 100+ files? Are hot files ranked correctly?

### Week 3: Stress tests (Tier 3)
Clone 2-3 Tier 3 projects (Astro docs, Sentry, Deno).
Focus: performance, false positives at scale, edge cases the small projects don't surface.

---

## Tracking Results

After each audit, append findings here:

### Results Log
<!-- Append findings below this line -->
