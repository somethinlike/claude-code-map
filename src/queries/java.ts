import type { ExtractedSymbol, ExtractedType, ExtractedRoute, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';

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

// Spring Boot route annotations
const SPRING_ROUTE_QUERY = `
(method_declaration
  (modifiers
    (marker_annotation
      name: (identifier) @annotation_name)) @modifiers
  name: (identifier) @handler_name)
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
  const captures = await runQuery(language, tree, SPRING_ROUTE_QUERY);

  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    if (cap.name === 'annotation_name' && SPRING_ANNOTATIONS[cap.text]) {
      const handler = captures.find((c, j) => j > i && c.name === 'handler_name');
      if (handler) {
        routes.push({
          method: SPRING_ANNOTATIONS[cap.text],
          path: `/${handler.text}`, // Spring routes need more parsing for the actual path
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

function parseJavaEnumBody(bodyText: string): TypeField[] {
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

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
