import { dirname, join, normalize, sep } from 'node:path';
import type { ExtractedImport, SupportedLanguage } from '../types.ts';
import { extractTsImports } from '../queries/typescript.ts';
import { extractPyImports } from '../queries/python.ts';
import { extractGoImports } from '../queries/go.ts';
import { extractRustImports } from '../queries/rust.ts';
import { extractJavaImports } from '../queries/java.ts';
import { extractCsharpImports } from '../queries/csharp.ts';
import { extractPhpImports } from '../queries/php.ts';
import { extractRubyImports } from '../queries/ruby.ts';
import { extractKotlinImports } from '../queries/kotlin.ts';

// --- Dispatcher ---

export async function extractImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return extractTsImports(tree, language, filePath);
    case 'python':
      return extractPyImports(tree, language, filePath);
    case 'go':
      return extractGoImports(tree, language, filePath);
    case 'rust':
      return extractRustImports(tree, language, filePath);
    case 'java':
      return extractJavaImports(tree, language, filePath);
    case 'csharp':
      return extractCsharpImports(tree, language, filePath);
    case 'php':
      return extractPhpImports(tree, language, filePath);
    case 'ruby':
      return extractRubyImports(tree, language, filePath);
    case 'kotlin':
      return extractKotlinImports(tree, language, filePath);
    default:
      return [];
  }
}

// --- Import Resolution ---

// TS/JS extensions to try when resolving relative imports
const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.astro'];
const TS_INDEX_FILES = TS_EXTENSIONS.map((ext) => `index${ext}`);

// Python file patterns for module resolution
const PY_PATTERNS = ['.py', '/__init__.py'];

/**
 * Attempt to resolve a raw import specifier to a project-relative file path.
 *
 * Resolution is purely set-based — we check the projectFiles set, no filesystem access.
 * Returns the matched project-relative path, or null if external / unresolvable.
 */
export function resolveImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
  language: SupportedLanguage,
): string | null {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
    case 'astro':
      return resolveTsImport(specifier, importingFile, projectFiles);
    case 'python':
      return resolvePyImport(specifier, importingFile, projectFiles);
    case 'go':
      return resolveGoImport(specifier, projectFiles);
    case 'rust':
      return resolveRustImport(specifier, importingFile, projectFiles);
    case 'java':
    case 'kotlin':
      return resolveJvmImport(specifier, projectFiles, language);
    case 'csharp':
      return resolveCsharpImport(specifier, projectFiles);
    case 'php':
      return resolvePhpImport(specifier, importingFile, projectFiles);
    case 'ruby':
      return resolveRubyImport(specifier, importingFile, projectFiles);
    default:
      return null;
  }
}

// --- Language-Specific Resolvers ---

function normalizePath(p: string): string {
  return normalize(p).replace(/\\/g, '/');
}

function resolveTsImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
): string | null {
  // Only resolve relative imports and @/ alias
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;

  let basePath: string;
  if (specifier.startsWith('@/')) {
    // Common alias: @/ maps to src/ or project root
    basePath = specifier.replace('@/', 'src/');
  } else {
    const dir = dirname(importingFile);
    basePath = normalizePath(join(dir, specifier));
  }

  // Strip .ts/.js extension if present (import './foo.ts' → look for foo.ts)
  const stripped = basePath.replace(/\.(ts|tsx|js|jsx)$/, '');

  // Try exact path (with original extension if provided)
  if (projectFiles.has(basePath)) return basePath;

  // Try each extension
  for (const ext of TS_EXTENSIONS) {
    const candidate = stripped + ext;
    if (projectFiles.has(candidate)) return candidate;
  }

  // Try index files (directory import)
  for (const indexFile of TS_INDEX_FILES) {
    const candidate = normalizePath(join(stripped, indexFile));
    if (projectFiles.has(candidate)) return candidate;
  }

  // Try with basePath as directory
  for (const indexFile of TS_INDEX_FILES) {
    const candidate = normalizePath(join(basePath, indexFile));
    if (projectFiles.has(candidate)) return candidate;
  }

  return null;
}

function resolvePyImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
): string | null {
  // Relative imports: from .foo import bar, from ..foo import bar
  if (specifier.startsWith('.')) {
    const dots = specifier.match(/^\.+/)?.[0] ?? '.';
    const modulePart = specifier.slice(dots.length);
    let baseDir = dirname(importingFile);

    // Each extra dot goes up one directory
    for (let i = 1; i < dots.length; i++) {
      baseDir = dirname(baseDir);
    }

    if (modulePart) {
      const modulePath = modulePart.replace(/\./g, '/');
      const candidate = normalizePath(join(baseDir, modulePath));
      for (const pattern of PY_PATTERNS) {
        const full = candidate + pattern;
        if (projectFiles.has(full)) return full;
      }
    }
    return null;
  }

  // Absolute imports: import foo.bar → look for foo/bar.py or foo/bar/__init__.py
  const modulePath = specifier.replace(/\./g, '/');
  for (const pattern of PY_PATTERNS) {
    const candidate = modulePath + pattern;
    if (projectFiles.has(candidate)) return candidate;
  }

  // Try with src/ prefix (common Python project layout)
  for (const pattern of PY_PATTERNS) {
    const candidate = 'src/' + modulePath + pattern;
    if (projectFiles.has(candidate)) return candidate;
  }

  return null;
}

function resolveGoImport(
  specifier: string,
  projectFiles: Set<string>,
): string | null {
  // Go imports are full module paths. We check if any project file
  // lives in a directory matching the last path segments.
  // e.g., "github.com/user/project/internal/auth" → look for internal/auth/*.go
  const parts = specifier.split('/');

  // Try progressively shorter suffixes
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join('/');
    for (const file of projectFiles) {
      if (file.startsWith(suffix + '/') && file.endsWith('.go')) {
        return file;
      }
    }
  }

  return null;
}

function resolveRustImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
): string | null {
  if (!specifier.startsWith('crate::') && !specifier.startsWith('super::') && !specifier.startsWith('self::')) {
    return null;
  }

  let modulePath: string;
  if (specifier.startsWith('crate::')) {
    // crate:: resolves from src/
    modulePath = specifier.replace('crate::', 'src/').replace(/::/g, '/');
  } else if (specifier.startsWith('super::')) {
    const dir = dirname(importingFile);
    const parentDir = dirname(dir);
    modulePath = normalizePath(join(parentDir, specifier.replace('super::', '').replace(/::/g, '/')));
  } else {
    // self::
    const dir = dirname(importingFile);
    modulePath = normalizePath(join(dir, specifier.replace('self::', '').replace(/::/g, '/')));
  }

  // Take the first segment (module name) — Rust modules map to files or directories
  const candidate = modulePath.split('/').slice(0, -1).join('/');
  const moduleName = modulePath.split('/').pop() ?? '';

  // Try: module.rs, module/mod.rs
  const directFile = `${modulePath}.rs`;
  if (projectFiles.has(directFile)) return directFile;

  const modFile = normalizePath(join(modulePath, 'mod.rs'));
  if (projectFiles.has(modFile)) return modFile;

  return null;
}

function resolveJvmImport(
  specifier: string,
  projectFiles: Set<string>,
  language: 'java' | 'kotlin',
): string | null {
  // Java/Kotlin: com.example.Foo → com/example/Foo.java or com/example/Foo.kt
  const pathPart = specifier.replace(/\./g, '/');
  const ext = language === 'java' ? '.java' : '.kt';

  // Try direct path
  const candidate = pathPart + ext;
  for (const file of projectFiles) {
    if (file.endsWith(candidate)) return file;
  }

  // Try with just the class name portion (last segment)
  const className = specifier.split('.').pop();
  if (className) {
    for (const file of projectFiles) {
      if (file.endsWith(`/${className}${ext}`) || file.endsWith(`/${className}.kts`)) {
        return file;
      }
    }
  }

  return null;
}

function resolveCsharpImport(
  specifier: string,
  projectFiles: Set<string>,
): string | null {
  // C# using directives are namespace-based, not direct file mappings.
  // Best effort: namespace segments may match directory structure.
  const pathPart = specifier.replace(/\./g, '/');

  for (const file of projectFiles) {
    if (file.endsWith('.cs') && file.includes(pathPart)) {
      return file;
    }
  }

  return null;
}

function resolvePhpImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
): string | null {
  // require/include with relative path
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const dir = dirname(importingFile);
    const candidate = normalizePath(join(dir, specifier));
    if (projectFiles.has(candidate)) return candidate;
    return null;
  }

  // PSR-4 style: App\Models\User → App/Models/User.php
  const pathPart = specifier.replace(/\\/g, '/');
  const candidate = pathPart + '.php';

  // Try direct
  if (projectFiles.has(candidate)) return candidate;

  // Try lowercase variants: app/Models/User.php (Laravel convention)
  const lcCandidate = candidate.charAt(0).toLowerCase() + candidate.slice(1);
  if (projectFiles.has(lcCandidate)) return lcCandidate;

  // Try src/ prefix
  if (projectFiles.has('src/' + candidate)) return 'src/' + candidate;

  return null;
}

function resolveRubyImport(
  specifier: string,
  importingFile: string,
  projectFiles: Set<string>,
): string | null {
  // require_relative resolves from the file's directory
  // The isExternal flag already distinguishes — if it's require_relative, the specifier is relative
  const dir = dirname(importingFile);
  const candidate = normalizePath(join(dir, specifier));

  // Try with .rb extension
  if (projectFiles.has(candidate + '.rb')) return candidate + '.rb';
  if (projectFiles.has(candidate)) return candidate;

  // For non-relative require: try lib/ prefix (common Ruby convention)
  if (projectFiles.has('lib/' + specifier + '.rb')) return 'lib/' + specifier + '.rb';
  if (projectFiles.has('app/' + specifier + '.rb')) return 'app/' + specifier + '.rb';

  return null;
}
