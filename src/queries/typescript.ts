import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import type { QueryCapture } from '../parser.ts';
import { truncate } from '../utils.ts';

// --- Export Queries ---

// Tree-sitter TypeScript uses separate node types for each export form.
// We run multiple simpler queries rather than one complex one.

const EXPORT_FUNCTION_QUERY = `
(export_statement
  declaration: (function_declaration
    name: (identifier) @fn_name
    parameters: (formal_parameters) @fn_params))
`;

const EXPORT_CLASS_QUERY = `
(export_statement
  declaration: (class_declaration
    name: (type_identifier) @class_name))
`;

const EXPORT_INTERFACE_QUERY = `
(export_statement
  declaration: (interface_declaration
    name: (type_identifier) @iface_name
    body: (interface_body) @iface_body))
`;

const EXPORT_TYPE_QUERY = `
(export_statement
  declaration: (type_alias_declaration
    name: (type_identifier) @type_name))
`;

const EXPORT_ENUM_QUERY = `
(export_statement
  declaration: (enum_declaration
    name: (identifier) @enum_name
    body: (enum_body) @enum_body))
`;

const EXPORT_CONST_QUERY = `
(export_statement
  declaration: (lexical_declaration
    (variable_declarator
      name: (identifier) @var_name)))
`;

// --- Type Queries (all, not just exported) ---

const INTERFACE_QUERY = `
(interface_declaration
  name: (type_identifier) @iface_name
  body: (interface_body) @iface_body)
`;

const TYPE_ALIAS_QUERY = `
(type_alias_declaration
  name: (type_identifier) @type_name)
`;

const ENUM_QUERY = `
(enum_declaration
  name: (identifier) @enum_name
  body: (enum_body) @enum_body)
`;

// --- Route Queries (Express/Fastify) ---

const EXPRESS_ROUTE_QUERY = `
(call_expression
  function: (member_expression
    object: (identifier) @router_obj
    property: (property_identifier) @http_method)
  arguments: (arguments
    (string) @route_path))
`;

// TypeScript-only node types that don't exist in the JavaScript grammar
const TS_ONLY = new Set(['typescript', 'tsx']);

// --- Extraction Functions ---

export async function extractTsExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];
  const isTs = TS_ONLY.has(language);

  // Functions
  const fnCaptures = await runQuery(language, tree, EXPORT_FUNCTION_QUERY);
  for (let i = 0; i < fnCaptures.length; i++) {
    const cap = fnCaptures[i];
    if (cap.name === 'fn_name') {
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `${cap.text}${truncate(params, 80)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        isDefault: false,
        language,
      });
    }
  }

  // Classes (uses type_identifier — TS grammar only)
  if (isTs) {
    const classCaptures = await runQuery(language, tree, EXPORT_CLASS_QUERY);
    for (const cap of classCaptures) {
      if (cap.name === 'class_name') {
        symbols.push({
          name: cap.text,
          kind: 'class',
          signature: `class ${cap.text}`,
          filePath,
          line: cap.startRow + 1,
          isExported: true,
          isDefault: false,
          language,
        });
      }
    }
  }

  // Interfaces (TS only)
  if (isTs) {
    const ifaceCaptures = await runQuery(language, tree, EXPORT_INTERFACE_QUERY);
    for (const cap of ifaceCaptures) {
      if (cap.name === 'iface_name') {
        symbols.push({
          name: cap.text,
          kind: 'interface',
          signature: `interface ${cap.text}`,
          filePath,
          line: cap.startRow + 1,
          isExported: true,
          isDefault: false,
          language,
        });
      }
    }
  }

  // Type aliases (TS only)
  if (isTs) {
    const typeCaptures = await runQuery(language, tree, EXPORT_TYPE_QUERY);
    for (const cap of typeCaptures) {
      if (cap.name === 'type_name') {
        symbols.push({
          name: cap.text,
          kind: 'type',
          signature: `type ${cap.text}`,
          filePath,
          line: cap.startRow + 1,
          isExported: true,
          isDefault: false,
          language,
        });
      }
    }
  }

  // Enums (TS only)
  if (isTs) {
    const enumCaptures = await runQuery(language, tree, EXPORT_ENUM_QUERY);
    for (const cap of enumCaptures) {
      if (cap.name === 'enum_name') {
        symbols.push({
          name: cap.text,
          kind: 'enum',
          signature: `enum ${cap.text}`,
          filePath,
          line: cap.startRow + 1,
          isExported: true,
          isDefault: false,
          language,
        });
      }
    }
  }

  // Constants
  const constCaptures = await runQuery(language, tree, EXPORT_CONST_QUERY);
  for (const cap of constCaptures) {
    if (cap.name === 'var_name') {
      symbols.push({
        name: cap.text,
        kind: 'constant',
        signature: `const ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        isDefault: false,
        language,
      });
    }
  }

  return symbols;
}

export async function extractTsTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  const types: ExtractedType[] = [];
  const isTs = TS_ONLY.has(language);

  if (!isTs) return types; // JS has no interfaces, type aliases, or enums

  // Interfaces
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
  for (let i = 0; i < ifaceCaptures.length; i++) {
    const cap = ifaceCaptures[i];
    if (cap.name === 'iface_name') {
      const bodyCapture = ifaceCaptures[i + 1]?.name === 'iface_body' ? ifaceCaptures[i + 1] : null;
      const fields = bodyCapture ? parseInterfaceBody(bodyCapture.text) : [];
      types.push({
        name: cap.text,
        kind: 'interface',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: true, // We'll refine this later if needed
        language,
      });
    }
  }

  // Type aliases
  const typeCaptures = await runQuery(language, tree, TYPE_ALIAS_QUERY);
  for (const cap of typeCaptures) {
    if (cap.name === 'type_name') {
      types.push({
        name: cap.text,
        kind: 'type',
        fields: [],
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        language,
      });
    }
  }

  // Enums
  const enumCaptures = await runQuery(language, tree, ENUM_QUERY);
  for (let i = 0; i < enumCaptures.length; i++) {
    const cap = enumCaptures[i];
    if (cap.name === 'enum_name') {
      const bodyCapture = enumCaptures[i + 1]?.name === 'enum_body' ? enumCaptures[i + 1] : null;
      const fields = bodyCapture ? parseEnumBody(bodyCapture.text) : [];
      types.push({
        name: cap.text,
        kind: 'enum',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        language,
      });
    }
  }

  return types;
}

// Objects that look like Express/Fastify routers
const ROUTER_NAMES = new Set([
  'app', 'router', 'server', 'api', 'route', 'routes',
  'express', 'fastify', 'hono', 'koa',
]);

// Objects that are NOT routers (Supabase client, fetch, etc.)
const NON_ROUTER_NAMES = new Set([
  'supabase', 'client', 'db', 'prisma', 'fetch',
  'axios', 'http', 'https', 'request', 'response',
  'cache', 'store', 'storage', 'map', 'set',
]);

export async function extractTsRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);
  const routes: ExtractedRoute[] = [];

  const captures = await runQuery(language, tree, EXPRESS_ROUTE_QUERY);

  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    if (cap.name === 'router_obj') {
      // Filter: only proceed if the object looks like a router
      const objName = cap.text.toLowerCase();
      if (NON_ROUTER_NAMES.has(objName)) continue;
      // If not a known router name, require the path to start with /
      const isKnownRouter = ROUTER_NAMES.has(objName);

      const methodCap = captures[i + 1];
      if (!methodCap || methodCap.name !== 'http_method') continue;
      if (!HTTP_METHODS.has(methodCap.text.toLowerCase())) continue;

      // The path is the next route_path capture after this router_obj.
      // Don't require same-line — multi-line router calls (where each
      // argument is on its own line) are common and the path may be
      // several lines after the router.method() call.
      const pathCapture = captures.find(
        (c, j) => j > i && c.name === 'route_path',
      );
      if (pathCapture) {
        const routePath = pathCapture.text.replace(/['"]/g, '');

        // Non-router objects: only accept if path looks like a URL path
        if (!isKnownRouter && !routePath.startsWith('/')) continue;

        routes.push({
          method: methodCap.text.toUpperCase(),
          path: routePath,
          filePath,
          line: cap.startRow + 1,
          handler: '',
          auth: false,
          framework: 'express',
        });
      }
    }
  }

  return routes;
}

// --- Helpers ---

export function parseInterfaceBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  // Remove braces and split by semicolons/newlines
  const inner = bodyText.slice(1, -1).trim();
  const lines = inner.split(/[;\n]/).filter((l) => l.trim());

  for (const line of lines) {
    const match = line.trim().match(/^(?:readonly\s+)?(\w+)(\??)\s*:\s*(.+)/);
    if (match) {
      fields.push({
        name: match[1],
        type: match[3].trim().replace(/;$/, ''),
        optional: match[2] === '?',
      });
    }
  }

  return fields;
}

export function parseEnumBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = bodyText.slice(1, -1).trim();
  const members = inner.split(',').filter((m) => m.trim());

  for (const member of members) {
    const name = member.trim().split(/\s*=/)[0].trim();
    if (name) {
      fields.push({ name, type: 'member', optional: false });
    }
  }

  return fields;
}

// --- Import Queries ---

const ES_IMPORT_QUERY = `
(import_statement
  source: (string) @import_source)
`;

// Re-exports forward symbols from another module without declaring them
// locally. They participate in the dependency graph just like imports —
// barrel files (export * from './x') would otherwise be invisible to
// the graph extractor because the parent node is export_statement, not
// import_statement.
const EXPORT_FROM_QUERY = `
(export_statement
  source: (string) @import_source)
`;

const REQUIRE_QUERY = `
(call_expression
  function: (identifier) @_func
  arguments: (arguments
    (string) @import_source))
`;

const DYNAMIC_IMPORT_QUERY = `
(call_expression
  function: (import)
  arguments: (arguments
    (string) @import_source))
`;

export async function extractTsImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // ES imports: import { foo } from './bar'
  const esCaptures = await runQuery(language, tree, ES_IMPORT_QUERY);
  for (const cap of esCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null, // resolved later by the import resolver
          filePath,
          line: cap.startRow + 1,
          isExternal: !source.startsWith('.') && !source.startsWith('@/'),
          language,
        });
      }
    }
  }

  // Re-exports: export * from './bar' / export { foo } from './bar' / export type * from './bar'
  const reexportCaptures = await runQuery(language, tree, EXPORT_FROM_QUERY);
  for (const cap of reexportCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: !source.startsWith('.') && !source.startsWith('@/'),
          language,
        });
      }
    }
  }

  // require() calls: const foo = require('./bar')
  const reqCaptures = await runQuery(language, tree, REQUIRE_QUERY);
  for (let i = 0; i < reqCaptures.length; i++) {
    const cap = reqCaptures[i];
    if (cap.name === '_func' && cap.text === 'require') {
      const sourceCap = reqCaptures[i + 1];
      if (sourceCap?.name === 'import_source') {
        const source = sourceCap.text.replace(/['"]/g, '');
        if (!seen.has(source)) {
          seen.add(source);
          imports.push({
            source,
            resolvedPath: null,
            filePath,
            line: sourceCap.startRow + 1,
            isExternal: !source.startsWith('.') && !source.startsWith('@/'),
            language,
          });
        }
      }
    }
  }

  // Dynamic imports: import('./bar')
  const dynCaptures = await runQuery(language, tree, DYNAMIC_IMPORT_QUERY);
  for (const cap of dynCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: !source.startsWith('.') && !source.startsWith('@/'),
          language,
        });
      }
    }
  }

  return imports;
}

