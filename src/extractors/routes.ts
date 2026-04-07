import type { ExtractedRoute, SupportedLanguage, DetectedFramework } from '../types.ts';
import { extractTsRoutes } from '../queries/typescript.ts';
import { extractPyRoutes } from '../queries/python.ts';
import { extractGoRoutes } from '../queries/go.ts';
import { extractJavaRoutes } from '../queries/java.ts';
import { extractPhpRoutes } from '../queries/php.ts';
import { extractRubyRoutes } from '../queries/ruby.ts';
import { extractKotlinRoutes } from '../queries/kotlin.ts';

const AUTH_PATTERNS = [
  'auth', 'authenticate', 'requireAuth', 'isAuthenticated',
  'protect', 'login_required', 'requires_auth', 'Authorize',
  'withAuth', 'checkPermissions', 'createPermissionHandler',
];

export async function extractRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
  framework: DetectedFramework,
): Promise<ExtractedRoute[]> {
  // File-based routing (Next.js, Astro)
  if (isFileBasedRouteFile(filePath, framework)) {
    return extractFileBasedRoutes(tree, filePath, framework);
  }

  // Code-based routing
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return extractTsRoutes(tree, language, filePath);
    case 'python':
      return extractPyRoutes(tree, language, filePath);
    case 'go':
      return extractGoRoutes(tree, language, filePath);
    case 'java':
      return extractJavaRoutes(tree, language, filePath);
    case 'php':
      return extractPhpRoutes(tree, language, filePath);
    case 'ruby':
      return extractRubyRoutes(tree, language, filePath);
    case 'kotlin':
      return extractKotlinRoutes(tree, language, filePath);
    default:
      return [];
  }
}

function isFileBasedRouteFile(filePath: string, framework: DetectedFramework): boolean {
  if (framework.id === 'nextjs-app' || framework.id === 'nextjs-both') {
    return filePath.includes('route.ts') || filePath.includes('route.js') ||
           filePath.includes('route.tsx') || filePath.includes('route.jsx');
  }
  return false;
}

function extractFileBasedRoutes(
  tree: any,
  filePath: string,
  framework: DetectedFramework,
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  if (framework.id === 'nextjs-app' || framework.id === 'nextjs-both') {
    const routePath = filePathToRoutePath(filePath);
    let source: string;
    try {
      source = tree.rootNode.text;
    } catch {
      return routes;
    }

    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const hasAuth = AUTH_PATTERNS.some((p) => source.includes(p));

    for (const method of methods) {
      const pattern = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`);
      if (pattern.test(source)) {
        routes.push({
          method,
          path: routePath,
          filePath,
          line: 1,
          handler: method,
          auth: hasAuth,
          framework: 'nextjs',
        });
      }
    }
  }

  return routes;
}

export function filePathToRoutePath(filePath: string): string {
  let route = filePath
    .replace(/^app\//, '/')
    .replace(/\/route\.\w+$/, '')
    .replace(/\([\w-]+\)\//g, '')
    .replace(/\[\.\.\.(\w+)\]/g, ':$1')
    .replace(/\[(\w+)\]/g, ':$1');

  if (!route.startsWith('/')) route = '/' + route;
  return route;
}
