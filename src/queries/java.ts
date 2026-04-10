import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// Java exports are determined by `public` modifier.

const CLASS_QUERY = `
(class_declaration
  (modifiers)? @modifiers
  name: (identifier) @class_name)
`;

const METHOD_QUERY = `
(method_declaration
  (modifiers)? @modifiers
  type: (_) @return_type
  name: (identifier) @method_name
  parameters: (formal_parameters) @method_params)
`;

const INTERFACE_QUERY = `
(interface_declaration
  (modifiers)? @modifiers
  name: (identifier) @iface_name)
`;

const ENUM_QUERY = `
(enum_declaration
  (modifiers)? @modifiers
  name: (identifier) @enum_name
  body: (enum_body) @enum_body)
`;

// Spring Boot route annotations — Java has THREE forms in real-world code:
// 1. Direct string:  @GetMapping("/users")
// 2. Named argument: @GetMapping(value = "/users") or @GetMapping(path = "/users")
// 3. Bare marker:    @GetMapping  (parses as marker_annotation, not annotation)
//
// Each form has a distinct parse tree, so we run a separate query per form
// and dedupe by handler name + line in the extractor.

const SPRING_ROUTE_WITH_PATH_QUERY = `
(method_declaration
  (modifiers
    (annotation
      name: (identifier) @annotation_name
      arguments: (annotation_argument_list
        (string_literal) @annotation_path)))
  name: (identifier) @handler_name)
`;

const SPRING_ROUTE_NAMED_ARG_QUERY = `
(method_declaration
  (modifiers
    (annotation
      name: (identifier) @annotation_name
      arguments: (annotation_argument_list
        (element_value_pair
          key: (identifier) @arg_key
          value: (string_literal) @annotation_path))))
  name: (identifier) @handler_name)
`;

const SPRING_ROUTE_BARE_QUERY = `
(method_declaration
  (modifiers
    (marker_annotation
      name: (identifier) @annotation_name))
  name: (identifier) @handler_name)
`;

// Class-level @RequestMapping provides the base path prefix.
// Same three forms as method-level, but in practice the named-arg form is
// the most common at class level (`@RequestMapping(path = "/foo")`).
const SPRING_CLASS_MAPPING_QUERY = `
(class_declaration
  (modifiers
    (annotation
      name: (identifier) @class_ann_name
      arguments: (annotation_argument_list
        (string_literal) @class_ann_path))))
`;

const SPRING_CLASS_MAPPING_NAMED_QUERY = `
(class_declaration
  (modifiers
    (annotation
      name: (identifier) @class_ann_name
      arguments: (annotation_argument_list
        (element_value_pair
          key: (identifier) @class_ann_key
          value: (string_literal) @class_ann_path))))
  name: (identifier) @class_name)
`;

export async function extractJavaExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Classes
  const classCaptures = await runQuery(language, tree, CLASS_QUERY);
  for (let i = 0; i < classCaptures.length; i++) {
    const cap = classCaptures[i];
    if (cap.name === 'class_name') {
      const modCap = classCaptures[i - 1]?.name === 'modifiers' ? classCaptures[i - 1] : null;
      symbols.push({
        name: cap.text,
        kind: 'class',
        signature: `class ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: modCap?.text?.includes('public') ?? false,
        isDefault: false,
        language,
      });
    }
  }

  // Methods
  const methodCaptures = await runQuery(language, tree, METHOD_QUERY);
  for (let i = 0; i < methodCaptures.length; i++) {
    const cap = methodCaptures[i];
    if (cap.name === 'method_name') {
      const modCap = methodCaptures.find((c, j) => j < i && c.name === 'modifiers');
      const retCap = methodCaptures[i - 1]?.name === 'return_type' ? methodCaptures[i - 1] : null;
      const paramsCap = methodCaptures[i + 1]?.name === 'method_params' ? methodCaptures[i + 1] : null;
      const returnType = retCap?.text || 'void';
      const params = paramsCap?.text || '()';

      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `${returnType} ${cap.text}${truncate(params, 60)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: modCap?.text?.includes('public') ?? false,
        isDefault: false,
        language,
      });
    }
  }

  return symbols;
}

export async function extractJavaTypes(
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
      const modCap = ifaceCaptures[i - 1]?.name === 'modifiers' ? ifaceCaptures[i - 1] : null;
      types.push({
        name: cap.text,
        kind: 'interface',
        fields: [],
        filePath,
        line: cap.startRow + 1,
        isExported: modCap?.text?.includes('public') ?? false,
        language,
      });
    }
  }

  // Enums
  const enumCaptures = await runQuery(language, tree, ENUM_QUERY);
  for (let i = 0; i < enumCaptures.length; i++) {
    const cap = enumCaptures[i];
    if (cap.name === 'enum_name') {
      const bodyCap = enumCaptures[i + 1]?.name === 'enum_body' ? enumCaptures[i + 1] : null;
      const fields = bodyCap ? parseJavaEnumBody(bodyCap.text) : [];
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

export async function extractJavaRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const SPRING_ANNOTATIONS: Record<string, string> = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
    RequestMapping: 'ALL',
  };

  const routes: ExtractedRoute[] = [];

  function alreadyHave(handler: string, line: number): boolean {
    return routes.some((r) => r.handler === handler && r.line === line);
  }

  // Resolve class-level @RequestMapping base path prefix.
  // Try the direct form first, then the named-argument form.
  let basePath = '';
  const classCaptures = await runQuery(language, tree, SPRING_CLASS_MAPPING_QUERY);
  for (let i = 0; i < classCaptures.length; i++) {
    const cap = classCaptures[i];
    if (cap.name === 'class_ann_name' && cap.text === 'RequestMapping') {
      const pathCap = classCaptures.find((c, j) => j > i && c.name === 'class_ann_path');
      if (pathCap) {
        basePath = stripStringQuotes(pathCap.text);
      }
      break;
    }
  }
  if (!basePath) {
    const classNamedCaptures = await runQuery(language, tree, SPRING_CLASS_MAPPING_NAMED_QUERY);
    for (let i = 0; i < classNamedCaptures.length; i++) {
      const cap = classNamedCaptures[i];
      if (cap.name === 'class_ann_name' && cap.text === 'RequestMapping') {
        const pathCap = classNamedCaptures.find((c, j) => j > i && c.name === 'class_ann_path');
        if (pathCap) {
          basePath = stripStringQuotes(pathCap.text);
        }
        break;
      }
    }
  }

  // 1. Annotations with direct string argument: @GetMapping("/users")
  const withPathCaptures = await runQuery(language, tree, SPRING_ROUTE_WITH_PATH_QUERY);
  for (let i = 0; i < withPathCaptures.length; i++) {
    const cap = withPathCaptures[i];
    if (cap.name === 'annotation_name' && SPRING_ANNOTATIONS[cap.text]) {
      const pathCap = withPathCaptures.find((c, j) => j > i && c.name === 'annotation_path');
      const handler = withPathCaptures.find((c, j) => j > i && c.name === 'handler_name');
      if (handler) {
        const routePath = pathCap ? stripStringQuotes(pathCap.text) : '/';
        if (!alreadyHave(handler.text, cap.startRow + 1)) {
          routes.push({
            method: SPRING_ANNOTATIONS[cap.text],
            path: joinPaths(basePath, routePath),
            filePath,
            line: cap.startRow + 1,
            handler: handler.text,
            auth: false,
            framework: 'spring',
          });
        }
      }
    }
  }

  // 2. Annotations with named argument: @GetMapping(path = "/users") or value = "/users"
  const namedArgCaptures = await runQuery(language, tree, SPRING_ROUTE_NAMED_ARG_QUERY);
  for (let i = 0; i < namedArgCaptures.length; i++) {
    const cap = namedArgCaptures[i];
    if (cap.name === 'annotation_name' && SPRING_ANNOTATIONS[cap.text]) {
      const pathCap = namedArgCaptures.find((c, j) => j > i && c.name === 'annotation_path');
      const handler = namedArgCaptures.find((c, j) => j > i && c.name === 'handler_name');
      if (handler && pathCap) {
        const routePath = stripStringQuotes(pathCap.text);
        if (!alreadyHave(handler.text, cap.startRow + 1)) {
          routes.push({
            method: SPRING_ANNOTATIONS[cap.text],
            path: joinPaths(basePath, routePath),
            filePath,
            line: cap.startRow + 1,
            handler: handler.text,
            auth: false,
            framework: 'spring',
          });
        }
      }
    }
  }

  // 3. Bare annotations with no arguments: @GetMapping (path defaults to base)
  const bareCaptures = await runQuery(language, tree, SPRING_ROUTE_BARE_QUERY);
  for (let i = 0; i < bareCaptures.length; i++) {
    const cap = bareCaptures[i];
    if (cap.name === 'annotation_name' && SPRING_ANNOTATIONS[cap.text]) {
      const handler = bareCaptures.find((c, j) => j > i && c.name === 'handler_name');
      if (handler && !alreadyHave(handler.text, cap.startRow + 1)) {
        routes.push({
          method: SPRING_ANNOTATIONS[cap.text],
          path: basePath || '/',
          filePath,
          line: cap.startRow + 1,
          handler: handler.text,
          auth: false,
          framework: 'spring',
        });
      }
    }
  }

  return routes;
}

/** Strip surrounding quotes from a tree-sitter string_literal text (e.g. `"/users"` -> `/users`) */
function stripStringQuotes(text: string): string {
  return text.replace(/^["']|["']$/g, '');
}

/** Join a base path and route path, avoiding double slashes */
function joinPaths(base: string, route: string): string {
  if (!base) return route;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}

export function parseJavaEnumBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = bodyText.replace(/^\{/, '').replace(/\}$/, '').trim();
  // Enum constants end at first semicolon or method declaration
  const constantsPart = inner.split(';')[0] || inner;
  const members = constantsPart.split(',').map((m) => m.trim()).filter(Boolean);

  for (const member of members) {
    const name = member.split(/[\s(]/)[0].trim();
    if (name && !name.startsWith('//')) {
      fields.push({ name, type: 'member', optional: false });
    }
  }

  return fields;
}

// --- Import Queries ---

const JAVA_IMPORT_QUERY = `
(import_declaration
  (scoped_identifier) @import_source)
`;

export async function extractJavaImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  const captures = await runQuery(language, tree, JAVA_IMPORT_QUERY);
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
          isExternal: true, // all Java imports are package paths; resolver determines locality later
          language,
        });
      }
    }
  }

  return imports;
}

