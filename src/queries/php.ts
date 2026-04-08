import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// PHP tree-sitter grammar: top-level declarations live inside a `program` node.
// Visibility modifiers (public/private/protected) are child nodes of method/property declarations.

const FUNCTION_QUERY = `
(function_definition
  name: (name) @fn_name
  parameters: (formal_parameters) @fn_params)
`;

const CLASS_QUERY = `
(class_declaration
  name: (name) @class_name
  body: (declaration_list) @class_body)
`;

const INTERFACE_QUERY = `
(interface_declaration
  name: (name) @iface_name
  body: (declaration_list) @iface_body)
`;

const TRAIT_QUERY = `
(trait_declaration
  name: (name) @trait_name)
`;

const ENUM_QUERY = `
(enum_declaration
  name: (name) @enum_name
  body: (enum_declaration_list) @enum_body)
`;

// Method declarations inside classes
const METHOD_QUERY = `
(class_declaration
  name: (name) @class_name
  body: (declaration_list
    (method_declaration
      (visibility_modifier) @visibility
      name: (name) @method_name
      parameters: (formal_parameters) @method_params)))
`;

// Laravel routes: Route::get('/path', ...)
const LARAVEL_ROUTE_QUERY = `
(expression_statement
  (member_call_expression
    object: (name) @route_obj
    name: (name) @http_method
    arguments: (arguments
      (string) @route_path)))
`;

export async function extractPhpExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Top-level functions
  const fnCaptures = await runQuery(language, tree, FUNCTION_QUERY);
  for (let i = 0; i < fnCaptures.length; i++) {
    const cap = fnCaptures[i];
    if (cap.name === 'fn_name') {
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `function ${cap.text}${truncate(params, 80)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true, // PHP top-level functions are always accessible
        isDefault: false,
        language,
      });
    }
  }

  // Classes
  const classCaptures = await runQuery(language, tree, CLASS_QUERY);
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
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
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

  // Traits
  const traitCaptures = await runQuery(language, tree, TRAIT_QUERY);
  for (const cap of traitCaptures) {
    if (cap.name === 'trait_name') {
      symbols.push({
        name: cap.text,
        kind: 'interface', // Closest analog
        signature: `trait ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        isDefault: false,
        language,
      });
    }
  }

  // Public methods
  const methodCaptures = await runQuery(language, tree, METHOD_QUERY);
  for (let i = 0; i < methodCaptures.length; i++) {
    const cap = methodCaptures[i];
    if (cap.name === 'method_name') {
      // Look back for visibility
      const vis = methodCaptures.slice(0, i).reverse().find((c) => c.name === 'visibility');
      const isPublic = !vis || vis.text === 'public';
      if (!isPublic) continue;

      const params = methodCaptures[i + 1]?.name === 'method_params' ? methodCaptures[i + 1].text : '()';
      const className = methodCaptures.slice(0, i).reverse().find((c) => c.name === 'class_name');
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `${className?.text || ''}::${cap.text}${truncate(params, 60)}`,
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

export async function extractPhpTypes(
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
      const fields = bodyCapture ? parsePhpInterfaceBody(bodyCapture.text) : [];
      types.push({
        name: cap.text,
        kind: 'interface',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        language,
      });
    }
  }

  // Enums (PHP 8.1+)
  const enumCaptures = await runQuery(language, tree, ENUM_QUERY);
  for (let i = 0; i < enumCaptures.length; i++) {
    const cap = enumCaptures[i];
    if (cap.name === 'enum_name') {
      const bodyCapture = enumCaptures[i + 1]?.name === 'enum_body' ? enumCaptures[i + 1] : null;
      const fields = bodyCapture ? parsePhpEnumBody(bodyCapture.text) : [];
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

export async function extractPhpRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Laravel routes: Route::get('/path', ...)
  const laravelCaptures = await runQuery(language, tree, LARAVEL_ROUTE_QUERY);
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'any', 'match']);

  for (let i = 0; i < laravelCaptures.length; i++) {
    const cap = laravelCaptures[i];
    if (cap.name === 'route_obj' && cap.text === 'Route') {
      const methodCap = laravelCaptures[i + 1];
      const pathCap = laravelCaptures[i + 2];
      if (methodCap?.name === 'http_method' && httpMethods.has(methodCap.text) && pathCap?.name === 'route_path') {
        routes.push({
          method: methodCap.text === 'any' ? 'ALL' : methodCap.text.toUpperCase(),
          path: pathCap.text.replace(/['"]/g, ''),
          filePath,
          line: cap.startRow + 1,
          handler: '',
          auth: false,
          framework: 'laravel',
        });
      }
    }
  }

  return routes;
}

export function parsePhpInterfaceBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    // public function methodName(Type $param): ReturnType;
    const methodMatch = line.trim().match(/^public\s+function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\??\w+))?/);
    if (methodMatch) {
      fields.push({
        name: methodMatch[1],
        type: methodMatch[3] || 'mixed',
        optional: methodMatch[3]?.startsWith('?') || false,
      });
    }
  }

  return fields;
}

export function parsePhpEnumBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    const caseMatch = line.trim().match(/^case\s+(\w+)/);
    if (caseMatch) {
      fields.push({
        name: caseMatch[1],
        type: 'case',
        optional: false,
      });
    }
  }

  return fields;
}

// --- Import Queries ---

const PHP_USE_QUERY = `
(namespace_use_declaration
  (namespace_use_clause
    (qualified_name) @import_source))
`;

const PHP_INCLUDE_QUERY = `
(expression_statement
  (include_expression
    (string) @import_source))
`;

export async function extractPhpImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // use App\Models\User;
  const useCaptures = await runQuery(language, tree, PHP_USE_QUERY);
  for (const cap of useCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: true, // use statements are namespace-based; resolver determines locality later
          language,
        });
      }
    }
  }

  // require './foo.php'; include '../bar.php';
  const includeCaptures = await runQuery(language, tree, PHP_INCLUDE_QUERY);
  for (const cap of includeCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        const isLocal = source.startsWith('./') || source.startsWith('../');
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: !isLocal,
          language,
        });
      }
    }
  }

  return imports;
}
