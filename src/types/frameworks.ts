export type FrameworkId =
  | 'nextjs-app'
  | 'nextjs-pages'
  | 'nextjs-both'
  | 'astro'
  | 'express'
  | 'fastify'
  | 'django'
  | 'flask'
  | 'generic';

export interface DetectedFramework {
  readonly id: FrameworkId;
  readonly name: string;
  readonly entryPoints: readonly string[];
  readonly routePatterns: readonly string[];
}
