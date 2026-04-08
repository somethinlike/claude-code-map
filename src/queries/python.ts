import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// Python has no export keyword. All top-level definitions are "exported."
// Names starting with _ are conventionally private.

const TOP_LEVEL_FUNCTION_QUERY = `
(module
  (function_definition
    name: (identifier) @fn_name
    parameters: (parameters) @fn_params
    return_type: (type)? @fn_return))
`;

const TOP_LEVEL_CLASS_QUERY = `
(module
  (class_definition
    name: (identifier) @class_name
    body: (block) @class_body))
`;

const DECORATED_FUNCTION_QUERY = `
(module
  (decorated_definition
    (decorator) @decorator
    definition: (function_definition
      name: (identifier) @fn_name
      parameters: (parameters) @fn_params)))
`;

// Flask routes: @app.route('/path')
const FLASK_ROUTE_QUERY = `
(decorated_definition
  (decorator
    (call
      function: (attribute
        object: (identifier) @app_obj
        attribute: (identifier) @route_method)
      arguments: (argument_list
        (string) @route_path)))
  definition: (function_definition
    name: (identifier) @handler_name))
`;

// Django urls: path('/url', view_func)
const DJANGO_URL_QUERY = `
(call
  function: (identifier) @url_func
  arguments: (argument_list
    (string) @url_path))
`;

export async function extractPyExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Top-level functions
  const fnCaptures = await runQuery(language, tree, TOP_LEVEL_FUNCTION_QUERY);
  for (let i = 0; i < fnCaptures.length; i++) {
    const cap = fnCaptures[i];
    if (cap.name === 'fn_name') {
      const isPrivate = cap.text.startsWith('_');
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      const returnType = fnCaptures[i + 2]?.name === 'fn_return' ? ` -> ${fnCaptures[i + 2].text}` : '';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `def ${cap.text}${truncate(params, 60)}${returnType}`,
        filePath,
        line: cap.startRow + 1,
        isExported: !isPrivate,
        isDefault: false,
        language,
      });
    }
  }

  // Top-level classes
  const classCaptures = await runQuery(language, tree, TOP_LEVEL_CLASS_QUERY);
  for (const cap of classCaptures) {
    if (cap.name === 'class_name') {
      symbols.push({
        name: cap.text,
        kind: 'class',
        signature: `class ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: !cap.text.startsWith('_'),
        isDefault: false,
        language,
      });
    }
  }

  // Decorated functions (catches @staticmethod, @classmethod, @app.route, etc.)
  const decoCaptures = await runQuery(language, tree, DECORATED_FUNCTION_QUERY);
  for (let i = 0; i < decoCaptures.length; i++) {
    const cap = decoCaptures[i];
    if (cap.name === 'fn_name') {
      // Skip if we already found this function in the top-level query
      if (symbols.some((s) => s.name === cap.text && s.filePath === filePath)) continue;

      const params = decoCaptures[i + 1]?.name === 'fn_params' ? decoCaptures[i + 1].text : '()';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `def ${cap.text}${truncate(params, 60)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: !cap.text.startsWith('_'),
        isDefault: false,
        language,
      });
    }
  }

  return symbols;
}

export async function extractPyTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  // Python doesn't have interfaces/enums in the same way
  // We extract class definitions as type-like structures
  const types: ExtractedType[] = [];

  const classCaptures = await runQuery(language, tree, TOP_LEVEL_CLASS_QUERY);
  for (let i = 0; i < classCaptures.length; i++) {
    const cap = classCaptures[i];
    if (cap.name === 'class_name') {
      const bodyCapture = classCaptures[i + 1]?.name === 'class_body' ? classCaptures[i + 1] : null;
      const fields = bodyCapture ? parsePythonClassFields(bodyCapture.text) : [];
      if (fields.length > 0) {
        types.push({
          name: cap.text,
          kind: 'interface', // Closest analog
          fields,
          filePath,
          line: cap.startRow + 1,
          isExported: !cap.text.startsWith('_'),
          language,
        });
      }
    }
  }

  return types;
}

export async function extractPyRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Flask routes
  const flaskCaptures = await runQuery(language, tree, FLASK_ROUTE_QUERY);
  for (let i = 0; i < flaskCaptures.length; i++) {
    const cap = flaskCaptures[i];
    if (cap.name === 'route_path') {
      const method = flaskCaptures.find(
        (c, j) => j < i && c.name === 'route_method',
      );
      const handler = flaskCaptures.find(
        (c, j) => j > i && c.name === 'handler_name',
      );

      const methodName = method?.text === 'route' ? 'GET' : method?.text?.toUpperCase() || 'GET';
      routes.push({
        method: methodName,
        path: cap.text.replace(/['"]/g, ''),
        filePath,
        line: cap.startRow + 1,
        handler: handler?.text || '',
        auth: false,
        framework: 'flask',
      });
    }
  }

  // Django URLs
  if (filePath.endsWith('urls.py')) {
    const djangoCaptures = await runQuery(language, tree, DJANGO_URL_QUERY);
    for (let i = 0; i < djangoCaptures.length; i++) {
      const cap = djangoCaptures[i];
      if (cap.name === 'url_func' && (cap.text === 'path' || cap.text === 're_path')) {
        const pathCap = djangoCaptures[i + 1];
        if (pathCap?.name === 'url_path') {
          routes.push({
            method: 'ALL',
            path: '/' + pathCap.text.replace(/['"]/g, ''),
            filePath,
            line: cap.startRow + 1,
            handler: '',
            auth: false,
            framework: 'django',
          });
        }
      }
    }
  }

  return routes;
}

export function parsePythonClassFields(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    // Class-level type annotations: name: type
    const annotationMatch = line.trim().match(/^(\w+)\s*:\s*(.+?)(?:\s*=.*)?$/);
    if (annotationMatch && !annotationMatch[1].startsWith('_')) {
      fields.push({
        name: annotationMatch[1],
        type: annotationMatch[2].trim(),
        optional: annotationMatch[2].includes('Optional') || line.includes('= None'),
      });
    }
  }

  return fields;
}

// --- Import Queries ---

const IMPORT_QUERY = `
(import_statement
  name: (dotted_name) @import_source)
`;

const FROM_IMPORT_QUERY = `
(import_from_statement
  module_name: (dotted_name) @import_source)
`;

const RELATIVE_IMPORT_QUERY = `
(import_from_statement
  module_name: (relative_import) @import_source)
`;

export async function extractPyImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // import os, import os.path
  const importCaptures = await runQuery(language, tree, IMPORT_QUERY);
  for (const cap of importCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: !source.startsWith('.'),
          language,
        });
      }
    }
  }

  // from os.path import join
  const fromCaptures = await runQuery(language, tree, FROM_IMPORT_QUERY);
  for (const cap of fromCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: !source.startsWith('.'),
          language,
        });
      }
    }
  }

  // from .module import something
  const relCaptures = await runQuery(language, tree, RELATIVE_IMPORT_QUERY);
  for (const cap of relCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: false, // relative imports are always local
          language,
        });
      }
    }
  }

  return imports;
}

