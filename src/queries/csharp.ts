import type { ExtractedSymbol, ExtractedType, ExtractedRoute, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';

// C# exports are determined by `public` modifier.

const CLASS_QUERY = `
(class_declaration
  name: (identifier) @class_name)
`;

const METHOD_QUERY = `
(method_declaration
  type: (_) @return_type
  name: (identifier) @method_name
  parameters: (parameter_list) @method_params)
`;

const INTERFACE_QUERY = `
(interface_declaration
  name: (identifier) @iface_name)
`;

const ENUM_QUERY = `
(enum_declaration
  name: (identifier) @enum_name
  body: (enum_member_declaration_list) @enum_body)
`;

const PROPERTY_QUERY = `
(property_declaration
  type: (_) @prop_type
  name: (identifier) @prop_name)
`;

export async function extractCsharpExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

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
        isExported: true, // Simplified — would need modifier checking
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
      const retCap = methodCaptures[i - 1]?.name === 'return_type' ? methodCaptures[i - 1] : null;
      const paramsCap = methodCaptures[i + 1]?.name === 'method_params' ? methodCaptures[i + 1] : null;
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `${retCap?.text || 'void'} ${cap.text}${truncate(paramsCap?.text || '()', 60)}`,
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

export async function extractCsharpTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  const types: ExtractedType[] = [];

  // Interfaces
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
  for (const cap of ifaceCaptures) {
    if (cap.name === 'iface_name') {
      types.push({
        name: cap.text,
        kind: 'interface',
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
      const bodyCap = enumCaptures[i + 1]?.name === 'enum_body' ? enumCaptures[i + 1] : null;
      const fields = bodyCap ? parseCsharpEnumBody(bodyCap.text) : [];
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

function parseCsharpEnumBody(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = bodyText.replace(/^\{/, '').replace(/\}$/, '').trim();
  const members = inner.split(',').map((m) => m.trim()).filter(Boolean);

  for (const member of members) {
    const name = member.split(/[\s=]/)[0].trim();
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
