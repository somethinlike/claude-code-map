import { describe, it, expect } from 'vitest';
import { extractFrontmatter, extractAstroImports, extractAstroRoutes, astroFilePathToRoute } from './astro.ts';

describe('extractFrontmatter', () => {
  it('extracts code between --- delimiters', () => {
    const source = `---\nimport Foo from './Foo';\nconst x = 1;\n---\n<html></html>`;
    expect(extractFrontmatter(source)).toBe("import Foo from './Foo';\nconst x = 1;");
  });

  it('returns empty string for files without frontmatter', () => {
    expect(extractFrontmatter('<html></html>')).toBe('');
  });

  it('handles empty frontmatter', () => {
    expect(extractFrontmatter('---\n---\n<html></html>')).toBe('');
  });
});

describe('extractAstroImports', () => {
  it('extracts ES imports from frontmatter', () => {
    const source = `---\nimport Layout from '../layouts/Layout.astro';\nimport { Workspace } from '../components/Workspace';\n---\n<Layout />`;
    const imports = extractAstroImports(source, 'src/pages/index.astro');

    expect(imports).toHaveLength(2);
    expect(imports[0].source).toBe('../layouts/Layout.astro');
    expect(imports[0].isExternal).toBe(false);
    expect(imports[1].source).toBe('../components/Workspace');
    expect(imports[1].isExternal).toBe(false);
  });

  it('marks non-relative imports as external', () => {
    const source = `---\nimport { Icon } from 'astro-icon';\n---\n<html />`;
    const imports = extractAstroImports(source, 'src/pages/index.astro');

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('astro-icon');
    expect(imports[0].isExternal).toBe(true);
  });

  it('returns empty for files without frontmatter', () => {
    const imports = extractAstroImports('<html />', 'src/pages/index.astro');
    expect(imports).toHaveLength(0);
  });

  it('deduplicates imports', () => {
    const source = `---\nimport A from './A';\nimport A from './A';\n---\n<html />`;
    const imports = extractAstroImports(source, 'src/pages/index.astro');
    expect(imports).toHaveLength(1);
  });

  it('extracts type imports', () => {
    const source = `---\nimport type { AuthState } from '../types/auth';\n---\n<html />`;
    const imports = extractAstroImports(source, 'src/pages/index.astro');

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('../types/auth');
  });
});

describe('astroFilePathToRoute', () => {
  it('converts index.astro to /', () => {
    expect(astroFilePathToRoute('src/pages/index.astro')).toBe('/');
  });

  it('converts simple pages', () => {
    expect(astroFilePathToRoute('src/pages/about.astro')).toBe('/about');
  });

  it('converts nested pages', () => {
    expect(astroFilePathToRoute('src/pages/app/settings.astro')).toBe('/app/settings');
  });

  it('converts dynamic params', () => {
    expect(astroFilePathToRoute('src/pages/games/[slug].astro')).toBe('/games/:slug');
  });

  it('converts catch-all params', () => {
    expect(astroFilePathToRoute('src/pages/app/read/[...path].astro')).toBe('/app/read/*');
  });

  it('converts nested index pages', () => {
    expect(astroFilePathToRoute('src/pages/games/index.astro')).toBe('/games');
  });

  it('returns null for 404 page', () => {
    expect(astroFilePathToRoute('src/pages/404.astro')).toBeNull();
  });

  it('returns null for non-page files', () => {
    expect(astroFilePathToRoute('src/components/Foo.astro')).toBeNull();
  });
});

describe('extractAstroRoutes', () => {
  it('produces a GET route for page files', () => {
    const routes = extractAstroRoutes('src/pages/app/settings.astro');
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/app/settings');
    expect(routes[0].framework).toBe('astro');
  });

  it('returns empty for layout files', () => {
    expect(extractAstroRoutes('src/layouts/Layout.astro')).toHaveLength(0);
  });

  it('returns empty for component files', () => {
    expect(extractAstroRoutes('src/components/Foo.astro')).toHaveLength(0);
  });
});
