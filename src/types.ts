/**
 * Type definitions barrel.
 *
 * Types are split by domain under `./types/` (one file per concern) per the
 * architecture rule that each domain gets its own module. This barrel exists
 * for backward compatibility with existing consumers — it re-exports every
 * symbol from the per-domain files unchanged.
 *
 * New code should prefer importing from the specific domain file for clearer
 * dependency intent:
 *
 *   import type { ExtractedSymbol } from './types/symbols.ts';
 *
 * rather than:
 *
 *   import type { ExtractedSymbol } from './types.ts';
 */
export * from './types/languages.ts';
export * from './types/symbols.ts';
export * from './types/routes.ts';
export * from './types/schema.ts';
export * from './types/extracted-types.ts';
export * from './types/frameworks.ts';
export * from './types/files.ts';
export * from './types/imports.ts';
export * from './types/graph.ts';
export * from './types/parsed.ts';
export * from './types/audit.ts';
export * from './types/cache.ts';
export * from './types/config.ts';
