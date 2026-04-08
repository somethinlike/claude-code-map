import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExtractedImport, ExtractedRoute, SupportedLanguage } from '../types.ts';

/**
 * Astro files have no tree-sitter grammar. We extract data via regex
 * from the frontmatter section (between --- delimiters).
 *
 * Frontmatter contains standard ES import statements.
 * Routes are derived from file paths (file-based routing).
 */

// --- Frontmatter Extraction ---

/**
 * Extract the frontmatter section from an .astro file's source.
 * Frontmatter is the code between the opening and closing --- delimiters.
 */
export function extractFrontmatter(source: string): string {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : '';
}

// --- Import Extraction (regex-based) ---

const ES_IMPORT_REGEX = /import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

export function extractAstroImports(
  source: string,
  filePath: string,
): ExtractedImport[] {
  const frontmatter = extractFrontmatter(source);
  if (!frontmatter) return [];

  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();
  const lines = frontmatter.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    // Reset regex lastIndex for each line
    ES_IMPORT_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ES_IMPORT_REGEX.exec(line)) !== null) {
      const specifier = match[1];
      if (!seen.has(specifier)) {
        seen.add(specifier);
        imports.push({
          source: specifier,
          resolvedPath: null,
          filePath,
          line: lineNum + 2, // +1 for 0-index, +1 for opening ---
          isExternal: !specifier.startsWith('.') && !specifier.startsWith('@/'),
          language: 'astro',
        });
      }
    }
  }

  return imports;
}

// --- Route Extraction (file-path-based) ---

/**
 * Derive an HTTP route from an Astro page's file path.
 * Astro uses file-based routing under src/pages/:
 *   src/pages/index.astro       → /
 *   src/pages/about.astro       → /about
 *   src/pages/app/settings.astro → /app/settings
 *   src/pages/games/[slug].astro → /games/:slug
 *   src/pages/app/read/[...path].astro → /app/read/*
 *   src/pages/404.astro         → (not a route)
 */
export function extractAstroRoutes(
  filePath: string,
): ExtractedRoute[] {
  // Only pages produce routes
  if (!filePath.includes('src/pages/')) return [];

  // Layouts aren't routes
  if (filePath.includes('src/layouts/')) return [];

  const routePath = astroFilePathToRoute(filePath);
  if (!routePath) return [];

  return [{
    method: 'GET',
    path: routePath,
    filePath,
    line: 1,
    handler: '',
    auth: false,
    framework: 'astro',
  }];
}

export function astroFilePathToRoute(filePath: string): string | null {
  // Normalize to forward slashes
  let route = filePath.replace(/\\/g, '/');

  // Strip prefix up to and including src/pages/
  const pagesIdx = route.indexOf('src/pages/');
  if (pagesIdx === -1) return null;
  route = route.slice(pagesIdx + 'src/pages/'.length);

  // Strip .astro extension
  route = route.replace(/\.astro$/, '');

  // Skip 404 — not a navigable route
  if (route === '404') return null;

  // Convert index to /
  route = route.replace(/\/index$/, '');
  if (route === 'index') route = '';

  // Convert [...param] to * (catch-all)
  route = route.replace(/\[\.\.\.(\w+)\]/g, '*');

  // Convert [param] to :param
  route = route.replace(/\[(\w+)\]/g, ':$1');

  return '/' + route;
}
