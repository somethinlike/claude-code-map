import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectedFramework } from './types.ts';

export async function detectFramework(projectRoot: string): Promise<DetectedFramework> {
  // Next.js
  const hasNextConfig =
    existsSync(join(projectRoot, 'next.config.js')) ||
    existsSync(join(projectRoot, 'next.config.ts')) ||
    existsSync(join(projectRoot, 'next.config.mjs'));

  if (hasNextConfig) {
    const hasAppDir = existsSync(join(projectRoot, 'app'));
    const hasPagesDir = existsSync(join(projectRoot, 'pages'));

    if (hasAppDir && hasPagesDir) {
      return {
        id: 'nextjs-both',
        name: 'Next.js (App + Pages Router)',
        entryPoints: ['app/layout.tsx', 'app/layout.ts', 'pages/_app.tsx', 'pages/_app.ts'],
        routePatterns: ['app/**/route.ts', 'app/**/page.tsx', 'pages/**/*.tsx'],
      };
    }
    if (hasAppDir) {
      return {
        id: 'nextjs-app',
        name: 'Next.js (App Router)',
        entryPoints: ['app/layout.tsx', 'app/layout.ts', 'app/layout.jsx'],
        routePatterns: ['app/**/route.ts', 'app/**/page.tsx'],
      };
    }
    if (hasPagesDir) {
      return {
        id: 'nextjs-pages',
        name: 'Next.js (Pages Router)',
        entryPoints: ['pages/_app.tsx', 'pages/_app.ts', 'pages/_app.jsx'],
        routePatterns: ['pages/**/*.tsx', 'pages/**/*.jsx'],
      };
    }
  }

  // Astro
  const hasAstroConfig =
    existsSync(join(projectRoot, 'astro.config.mjs')) ||
    existsSync(join(projectRoot, 'astro.config.ts')) ||
    existsSync(join(projectRoot, 'astro.config.js'));

  if (hasAstroConfig) {
    return {
      id: 'astro',
      name: 'Astro',
      entryPoints: ['src/pages/index.astro', 'src/layouts/Layout.astro'],
      routePatterns: ['src/pages/**/*.astro'],
    };
  }

  // Express / Fastify (check package.json dependencies)
  const pkgJsonPath = join(projectRoot, 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps.fastify) {
        return {
          id: 'fastify',
          name: 'Fastify',
          entryPoints: ['src/index.ts', 'src/app.ts', 'src/server.ts', 'index.ts'],
          routePatterns: ['src/**/*.ts'],
        };
      }

      if (allDeps.express) {
        return {
          id: 'express',
          name: 'Express',
          entryPoints: ['src/index.ts', 'src/app.ts', 'src/server.ts', 'index.ts', 'app.ts', 'server.ts'],
          routePatterns: ['src/**/*.ts', 'routes/**/*.ts'],
        };
      }
    } catch {
      // Malformed package.json, continue
    }
  }

  // Django
  if (existsSync(join(projectRoot, 'manage.py'))) {
    return {
      id: 'django',
      name: 'Django',
      entryPoints: ['manage.py'],
      routePatterns: ['**/urls.py'],
    };
  }

  // Flask (quick heuristic: check a few Python files for flask import)
  const candidateFlaskFiles = ['app.py', 'main.py', 'src/app.py', 'src/main.py'];
  for (const candidate of candidateFlaskFiles) {
    const candidatePath = join(projectRoot, candidate);
    if (existsSync(candidatePath)) {
      try {
        const content = readFileSync(candidatePath, 'utf-8').slice(0, 2000);
        if (content.includes('from flask') || content.includes('import flask')) {
          return {
            id: 'flask',
            name: 'Flask',
            entryPoints: [candidate],
            routePatterns: ['**/*.py'],
          };
        }
      } catch {
        // Read failed, continue
      }
    }
  }

  // Generic fallback
  return {
    id: 'generic',
    name: 'Generic',
    entryPoints: [],
    routePatterns: [],
  };
}
