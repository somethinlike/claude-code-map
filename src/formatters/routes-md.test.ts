import { describe, it, expect } from 'vitest';
import { formatRoutes, groupRoutesByPrefix } from './routes-md.ts';
import type { ExtractedRoute, DetectedFramework, FrameworkId } from '../types.ts';

function makeRoute(overrides: Partial<ExtractedRoute> = {}): ExtractedRoute {
  return {
    method: 'GET',
    path: '/api/users',
    filePath: 'src/routes/users.ts',
    line: 10,
    handler: 'getUsers',
    auth: false,
    framework: 'express',
    ...overrides,
  };
}

function makeFramework(overrides: Partial<DetectedFramework> = {}): DetectedFramework {
  return {
    id: 'express' as FrameworkId,
    name: 'Express',
    entryPoints: [],
    routePatterns: [],
    ...overrides,
  };
}

describe('formatRoutes', () => {
  it('returns null for empty routes', () => {
    const result = formatRoutes([], makeFramework());
    expect(result).toBeNull();
  });

  it('single route output contains the route path', () => {
    const route = makeRoute({ path: '/api/health' });
    const result = formatRoutes([route], makeFramework());
    expect(result).not.toBeNull();
    expect(result).toContain('/api/health');
  });

  it('framework name appears in header', () => {
    const route = makeRoute();
    const result = formatRoutes([route], makeFramework({ name: 'Fastify' }));
    expect(result).toContain('**Framework:** Fastify');
  });

  it('auth flag shows auth indicator', () => {
    const route = makeRoute({ auth: true, path: '/api/secret' });
    const result = formatRoutes([route], makeFramework());
    expect(result).toContain('auth');
  });

  it('6+ routes in same prefix triggers collapse with summary row', () => {
    // COLLAPSE_THRESHOLD is 5, so 6 routes triggers collapse
    const routes = Array.from({ length: 6 }, (_, i) =>
      makeRoute({ path: `/api/items/${i}`, handler: `handler${i}` }),
    );
    const result = formatRoutes(routes, makeFramework())!;
    // Collapsed format shows "N routes" summary and "...N more"
    expect(result).toContain('6 routes');
    expect(result).toContain('...3 more');
  });

  it('5 or fewer routes in same prefix shows full table with File column', () => {
    const routes = Array.from({ length: 4 }, (_, i) =>
      makeRoute({ path: `/api/items/${i}`, handler: `handler${i}` }),
    );
    const result = formatRoutes(routes, makeFramework())!;
    // Non-collapsed format includes File column header
    expect(result).toContain('| Method | Path | Auth | File |');
  });

  it('shows total route count', () => {
    const routes = [
      makeRoute({ path: '/api/a' }),
      makeRoute({ path: '/api/b' }),
      makeRoute({ path: '/api/c' }),
    ];
    const result = formatRoutes(routes, makeFramework())!;
    expect(result).toContain('**Total routes:** 3');
  });
});

describe('groupRoutesByPrefix', () => {
  it('groups routes with same 2-segment prefix together', () => {
    const routes = [
      makeRoute({ path: '/api/users/1' }),
      makeRoute({ path: '/api/users/2' }),
      makeRoute({ path: '/api/posts/1' }),
    ];
    const groups = groupRoutesByPrefix(routes);
    expect(Object.keys(groups)).toContain('/api/users');
    expect(Object.keys(groups)).toContain('/api/posts');
    expect(groups['/api/users']).toHaveLength(2);
    expect(groups['/api/posts']).toHaveLength(1);
  });

  it('single-segment path uses that segment as prefix', () => {
    const routes = [makeRoute({ path: '/health' })];
    const groups = groupRoutesByPrefix(routes);
    expect(Object.keys(groups)).toContain('/health');
  });
});
