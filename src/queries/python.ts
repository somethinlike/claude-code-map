import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, ExtractedModel, SchemaField, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';
import { ORM_AUDIT_COLUMNS } from '../types.ts';

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

// Django models: class Foo(models.Model): ...
// Catches direct subclasses of `models.Model`. Indirect subclasses
// (custom abstract base classes) are a known gap.
const DJANGO_MODEL_QUERY = `
(class_definition
  name: (identifier) @model_name
  superclasses: (argument_list
    (attribute
      object: (identifier) @sup_obj
      attribute: (identifier) @sup_attr))
  body: (block) @model_body)
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

  // Django URLs. Three URL function forms in the wild:
  //   path('articles/', view)        — Django 2.0+
  //   re_path(r'^articles/$', view)  — Django 2.0+ regex form
  //   url(r'^articles/$', view)      — Django <2.0, still common in older codebases
  if (filePath.endsWith('urls.py')) {
    const djangoUrlFns = new Set(['path', 're_path', 'url']);
    const djangoCaptures = await runQuery(language, tree, DJANGO_URL_QUERY);
    for (let i = 0; i < djangoCaptures.length; i++) {
      const cap = djangoCaptures[i];
      if (cap.name === 'url_func' && djangoUrlFns.has(cap.text)) {
        const pathCap = djangoCaptures[i + 1];
        if (pathCap?.name === 'url_path') {
          // Strip Python string prefixes (r"...", b"...") and quotes
          const rawPath = pathCap.text.replace(/^[rRbBuU]+/, '').replace(/['"]/g, '');
          routes.push({
            method: 'ALL',
            path: rawPath.startsWith('/') ? rawPath : '/' + rawPath,
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

export async function extractPyModels(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedModel[]> {
  const models: ExtractedModel[] = [];

  // Skip files that aren't likely to contain Django models. Most Django
  // projects keep models in models.py (or split them into a models/ directory).
  // The cheap path-check avoids running the query on every Python file.
  if (!filePath.endsWith('models.py') && !filePath.includes('/models/')) {
    return models;
  }

  const captures = await runQuery(language, tree, DJANGO_MODEL_QUERY);
  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    if (cap.name !== 'model_name') continue;

    const supObj = captures.find((c, j) => j > i && c.name === 'sup_obj');
    const supAttr = captures.find((c, j) => j > i && c.name === 'sup_attr');
    if (supObj?.text !== 'models' || supAttr?.text !== 'Model') continue;

    const bodyCap = captures.find((c, j) => j > i && c.name === 'model_body');
    const fields = bodyCap ? parseDjangoModelFields(bodyCap.text) : [];

    models.push({
      name: cap.text,
      fields,
      filePath,
      orm: 'django',
    });
  }

  return models;
}

/**
 * Parse the body of a Django model class to extract field declarations.
 * Each field looks like: `name = models.CharField(max_length=100, ...)`.
 * Picks out the field name and the field type (the django field class).
 */
export function parseDjangoModelFields(bodyText: string): SchemaField[] {
  const fields: SchemaField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    // Pattern: `field_name = models.SomeField(...)` (handles indentation)
    const match = line.trim().match(/^(\w+)\s*=\s*models\.(\w+)\s*\((.*)\)?/);
    if (!match) continue;
    const [, name, fieldType, args = ''] = match;
    if (ORM_AUDIT_COLUMNS.has(name)) continue;

    const isRelation = /^(ForeignKey|OneToOneField|ManyToManyField)$/.test(fieldType);
    const isPK = /primary_key\s*=\s*True/.test(args);
    const isUnique = /unique\s*=\s*True/.test(args);
    const required = !/null\s*=\s*True/.test(args) && !/blank\s*=\s*True/.test(args);

    const attributes: string[] = [];
    if (isPK) attributes.push('PK');
    if (isUnique) attributes.push('UQ');
    if (isRelation) attributes.push('FK');

    fields.push({
      name,
      type: fieldType,
      required,
      isRelation,
      attributes,
    });
  }

  return fields;
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

