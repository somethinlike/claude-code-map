import type { ExtractedSymbol, ExtractedType, ExtractedRoute, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import type { QueryCapture } from '../parser.ts';

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

// --- Extraction Functions ---

export async function extractTsExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

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

  // Classes
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

  // Interfaces
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

  // Type aliases
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

  // Enums
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
    if (cap.name === 'http_method' && HTTP_METHODS.has(cap.text.toLowerCase())) {
      const pathCapture = captures.find(
        (c, j) => j > i && c.name === 'route_path' && c.startRow === cap.startRow,
      );
      if (pathCapture) {
        const routePath = pathCapture.text.replace(/['"]/g, '');
        routes.push({
          method: cap.text.toUpperCase(),
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

function parseInterfaceBody(bodyText: string): TypeField[] {
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

function parseEnumBody(bodyText: string): TypeField[] {
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

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
