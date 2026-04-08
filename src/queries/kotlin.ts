import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// Kotlin: public by default. Visibility modifiers: public, private, internal, protected.
// Functions, classes, interfaces, enums, objects, data classes.
// Spring Boot annotations for routes (same as Java but Kotlin syntax).

const FUNCTION_QUERY = `
(function_declaration
  (simple_identifier) @fn_name
  (function_value_parameters) @fn_params)
`;

const CLASS_QUERY = `
(class_declaration
  (type_identifier) @class_name
  (class_body)? @class_body)
`;

const OBJECT_QUERY = `
(object_declaration
  (type_identifier) @obj_name)
`;

const INTERFACE_QUERY = `
(class_declaration
  (type_identifier) @iface_name
  (class_body)? @iface_body)
`;

// Kotlin Spring routes use same annotations as Java
const SPRING_ANNOTATION_QUERY = `
(function_declaration
  (modifiers
    (annotation
      (user_type (type_identifier) @anno_name)
      (value_arguments
        (value_argument
          (string_literal) @route_path))?))
  (simple_identifier) @handler_name)
`;

const SPRING_MARKER_QUERY = `
(function_declaration
  (modifiers
    (annotation
      (user_type (type_identifier) @anno_name)))
  (simple_identifier) @handler_name)
`;

const CLASS_ANNOTATION_QUERY = `
(class_declaration
  (modifiers
    (annotation
      (user_type (type_identifier) @anno_name)
      (value_arguments
        (value_argument
          (string_literal) @base_path))?))
  (type_identifier) @class_name)
`;

const SPRING_METHODS: Record<string, string> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  PatchMapping: 'PATCH',
  DeleteMapping: 'DELETE',
  RequestMapping: 'ALL',
};

function stripStringQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}

function joinPaths(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  if (!b && !p) return '/';
  if (!b) return '/' + p;
  if (!p) return b;
  return b + '/' + p;
}

export async function extractKotlinExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Functions
  const fnCaptures = await runQuery(language, tree, FUNCTION_QUERY);
  for (let i = 0; i < fnCaptures.length; i++) {
    const cap = fnCaptures[i];
    if (cap.name === 'fn_name') {
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `fun ${cap.text}${truncate(params, 80)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true, // Kotlin is public by default
        isDefault: false,
        language,
      });
    }
  }

  // Classes (including data classes, sealed classes)
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

  // Objects (singletons)
  const objCaptures = await runQuery(language, tree, OBJECT_QUERY);
  for (const cap of objCaptures) {
    if (cap.name === 'obj_name') {
      symbols.push({
        name: cap.text,
        kind: 'class',
        signature: `object ${cap.text}`,
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

export async function extractKotlinTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  const types: ExtractedType[] = [];

  // Interfaces (Kotlin grammar uses class_declaration for interfaces too,
  // but we detect via the source text containing "interface" keyword)
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
  for (let i = 0; i < ifaceCaptures.length; i++) {
    const cap = ifaceCaptures[i];
    if (cap.name === 'iface_name') {
      const bodyCapture = ifaceCaptures[i + 1]?.name === 'iface_body' ? ifaceCaptures[i + 1] : null;
      const fields = bodyCapture ? parseKotlinInterfaceBody(bodyCapture.text) : [];
      // Only include if it's actually an interface (has fields or methods)
      if (fields.length > 0) {
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
  }

  return types;
}

export async function extractKotlinRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Find class-level @RequestMapping base path
  let basePath = '';
  const classAnnoCaptures = await runQuery(language, tree, CLASS_ANNOTATION_QUERY);
  for (let i = 0; i < classAnnoCaptures.length; i++) {
    const cap = classAnnoCaptures[i];
    if (cap.name === 'anno_name' && cap.text === 'RequestMapping') {
      const pathCap = classAnnoCaptures.find((c, j) => j > i && c.name === 'base_path');
      if (pathCap) basePath = stripStringQuotes(pathCap.text);
      break;
    }
  }

  // Spring annotations with path arguments
  const annoCaptures = await runQuery(language, tree, SPRING_ANNOTATION_QUERY);
  for (let i = 0; i < annoCaptures.length; i++) {
    const cap = annoCaptures[i];
    if (cap.name === 'anno_name' && SPRING_METHODS[cap.text]) {
      const pathCap = annoCaptures.find((c, j) => j > i && j < i + 3 && c.name === 'route_path');
      const handlerCap = annoCaptures.find((c, j) => j > i && c.name === 'handler_name');
      const path = pathCap ? stripStringQuotes(pathCap.text) : '';
      routes.push({
        method: SPRING_METHODS[cap.text],
        path: joinPaths(basePath, path),
        filePath,
        line: cap.startRow + 1,
        handler: handlerCap?.text || '',
        auth: false,
        framework: 'spring',
      });
    }
  }

  // Bare annotations (no path argument)
  const markerCaptures = await runQuery(language, tree, SPRING_MARKER_QUERY);
  for (let i = 0; i < markerCaptures.length; i++) {
    const cap = markerCaptures[i];
    if (cap.name === 'anno_name' && SPRING_METHODS[cap.text]) {
      const handlerCap = markerCaptures.find((c, j) => j > i && c.name === 'handler_name');
      // Skip if already found via annotation query (has path)
      const handlerName = handlerCap?.text || '';
      if (routes.some((r) => r.handler === handlerName && r.filePath === filePath)) continue;
      routes.push({
        method: SPRING_METHODS[cap.text],
        path: joinPaths(basePath, ''),
        filePath,
        line: cap.startRow + 1,
        handler: handlerName,
        auth: false,
        framework: 'spring',
      });
    }
  }

  return routes;
}

export function parseKotlinInterfaceBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    // val name: Type
    // fun methodName(params): ReturnType
    const propMatch = line.trim().match(/^(?:val|var)\s+(\w+)\s*:\s*(.+?)(?:\s*[=,].*)?$/);
    if (propMatch) {
      const isOptional = propMatch[2].includes('?');
      fields.push({
        name: propMatch[1],
        type: propMatch[2].trim().replace(/\?$/, ''),
        optional: isOptional,
      });
      continue;
    }

    const funMatch = line.trim().match(/^fun\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\S+))?/);
    if (funMatch) {
      fields.push({
        name: funMatch[1],
        type: funMatch[3] || 'Unit',
        optional: false,
      });
    }
  }

  return fields;
}

// --- Import Queries ---

const KOTLIN_IMPORT_QUERY = `
(import_header
  (identifier) @import_source)
`;

export async function extractKotlinImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  const captures = await runQuery(language, tree, KOTLIN_IMPORT_QUERY);
  for (const cap of captures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: true, // all Kotlin imports are package paths; resolver determines locality later
          language,
        });
      }
    }
  }

  return imports;
}
