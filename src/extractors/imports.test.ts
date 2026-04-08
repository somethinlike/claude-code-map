import { describe, it, expect } from 'vitest';
import { resolveImport } from './imports.ts';

// Mock project file sets for each language
const tsFiles = new Set([
  'src/utils.ts',
  'src/types.ts',
  'src/lib/db.ts',
  'src/lib/index.ts',
  'src/components/Header.tsx',
]);

const pyFiles = new Set([
  'app/models.py',
  'app/views.py',
  'app/__init__.py',
  'app/utils/helpers.py',
  'app/utils/__init__.py',
  'src/core/engine.py',
]);

const goFiles = new Set([
  'internal/auth/auth.go',
  'internal/auth/middleware.go',
  'pkg/util/strings.go',
]);

const rustFiles = new Set([
  'src/main.rs',
  'src/lib.rs',
  'src/auth.rs',
  'src/auth/mod.rs',
  'src/db/mod.rs',
]);

const javaFiles = new Set([
  'src/main/java/com/example/User.java',
  'src/main/java/com/example/UserService.java',
]);

describe('resolveImport — TypeScript', () => {
  it('resolves relative imports with extension inference', () => {
    const result = resolveImport('./utils', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBe('src/utils.ts');
  });

  it('resolves relative imports with explicit extension', () => {
    const result = resolveImport('./types.ts', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBe('src/types.ts');
  });

  it('resolves directory imports via index file', () => {
    const result = resolveImport('./lib', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBe('src/lib/index.ts');
  });

  it('resolves nested relative imports', () => {
    const result = resolveImport('./db', 'src/lib/index.ts', tsFiles, 'typescript');
    expect(result).toBe('src/lib/db.ts');
  });

  it('resolves parent-relative imports', () => {
    const result = resolveImport('../types', 'src/lib/db.ts', tsFiles, 'typescript');
    expect(result).toBe('src/types.ts');
  });

  it('returns null for external packages', () => {
    const result = resolveImport('react', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null for unresolvable imports', () => {
    const result = resolveImport('./nonexistent', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBeNull();
  });

  it('resolves tsx files', () => {
    const result = resolveImport('./components/Header', 'src/cli.ts', tsFiles, 'typescript');
    expect(result).toBe('src/components/Header.tsx');
  });
});

describe('resolveImport — Python', () => {
  it('resolves relative imports', () => {
    const result = resolveImport('.models', 'app/views.py', pyFiles, 'python');
    expect(result).toBe('app/models.py');
  });

  it('resolves absolute imports matching project files', () => {
    const result = resolveImport('app.models', 'test.py', pyFiles, 'python');
    expect(result).toBe('app/models.py');
  });

  it('resolves package imports via __init__.py', () => {
    const result = resolveImport('app.utils', 'test.py', pyFiles, 'python');
    expect(result).toBe('app/utils/__init__.py');
  });

  it('returns null for stdlib modules', () => {
    const result = resolveImport('os', 'app/views.py', pyFiles, 'python');
    expect(result).toBeNull();
  });
});

describe('resolveImport — Go', () => {
  it('resolves local packages by suffix matching', () => {
    const result = resolveImport('github.com/user/project/internal/auth', 'main.go', goFiles, 'go');
    expect(result).toBe('internal/auth/auth.go');
  });

  it('returns null for stdlib packages', () => {
    const result = resolveImport('fmt', 'main.go', goFiles, 'go');
    expect(result).toBeNull();
  });
});

describe('resolveImport — Rust', () => {
  it('resolves crate:: imports to src/', () => {
    const result = resolveImport('crate::auth', 'src/main.rs', rustFiles, 'rust');
    expect(result).toBe('src/auth.rs');
  });

  it('resolves crate:: to mod.rs for directories', () => {
    const result = resolveImport('crate::db', 'src/main.rs', rustFiles, 'rust');
    expect(result).toBe('src/db/mod.rs');
  });

  it('returns null for external crates', () => {
    const result = resolveImport('serde::Serialize', 'src/main.rs', rustFiles, 'rust');
    expect(result).toBeNull();
  });
});

describe('resolveImport — Java', () => {
  it('resolves class imports by matching file suffix', () => {
    const result = resolveImport('com.example.User', 'App.java', javaFiles, 'java');
    expect(result).toBe('src/main/java/com/example/User.java');
  });

  it('returns null for external packages', () => {
    const result = resolveImport('java.util.List', 'App.java', javaFiles, 'java');
    expect(result).toBeNull();
  });
});

describe('resolveImport — Ruby', () => {
  const rbFiles = new Set(['lib/utils.rb', 'app/models/user.rb']);

  it('resolves require_relative paths', () => {
    const result = resolveImport('./utils', 'lib/main.rb', rbFiles, 'ruby');
    expect(result).toBe('lib/utils.rb');
  });

  it('resolves require with lib/ prefix', () => {
    const result = resolveImport('utils', 'app/main.rb', rbFiles, 'ruby');
    expect(result).toBe('lib/utils.rb');
  });
});

describe('resolveImport — PHP', () => {
  const phpFiles = new Set(['app/Models/User.php', 'src/Helpers.php']);

  it('resolves relative require paths', () => {
    const result = resolveImport('../src/Helpers.php', 'app/index.php', phpFiles, 'php');
    expect(result).toBe('src/Helpers.php');
  });

  it('returns null for unresolvable use statements', () => {
    const result = resolveImport('Illuminate\\Support\\Facades\\DB', 'app/index.php', phpFiles, 'php');
    expect(result).toBeNull();
  });
});

describe('resolveImport — C#', () => {
  const csFiles = new Set(['Models/User.cs', 'Services/UserService.cs']);

  it('resolves namespace-matching using directives', () => {
    const result = resolveImport('Models', 'Program.cs', csFiles, 'csharp');
    expect(result).toBe('Models/User.cs');
  });
});
