import type { ExtractedSymbol, ExtractedType, ExtractedRoute, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// C# exports are determined by `public` modifier.
// The C# WASM grammar represents modifiers as individual `(modifier)` child nodes
// (not a wrapping `(modifiers)` group like Java). To avoid cross-product duplicates
// when a declaration has multiple modifiers (e.g. `public static`), we query modifiers
// separately and correlate by source line.

const CLASS_QUERY = `
(class_declaration
  name: (identifier) @class_name)
`;

// Captures modifier + class name on the same declaration for correlation
const CLASS_MODIFIER_QUERY = `
(class_declaration
  (modifier) @modifier
  name: (identifier) @class_name)
`;

const METHOD_QUERY = `
(method_declaration
  type: (_) @return_type
  name: (identifier) @method_name
  parameters: (parameter_list) @method_params)
`;

// Captures modifier + method name on the same declaration for correlation
const METHOD_MODIFIER_QUERY = `
(method_declaration
  (modifier) @modifier
  name: (identifier) @method_name)
`;

const INTERFACE_QUERY = `
(interface_declaration
  name: (identifier) @iface_name)
`;

const INTERFACE_MODIFIER_QUERY = `
(interface_declaration
  (modifier) @modifier
  name: (identifier) @iface_name)
`;

const ENUM_QUERY = `
(enum_declaration
  name: (identifier) @enum_name
  body: (enum_member_declaration_list) @enum_body)
`;

const ENUM_MODIFIER_QUERY = `
(enum_declaration
  (modifier) @modifier
  name: (identifier) @enum_name)
`;

const PROPERTY_QUERY = `
(property_declaration
  type: (_) @prop_type
  name: (identifier) @prop_name)
`;

/**
 * Build a map of declaration name → set of modifier texts from a modifier query.
 * Handles multiple modifiers per declaration (e.g. "public static") by collecting
 * all modifier captures that precede each name capture.
 */
function buildModifierMap(captures: { name: string; text: string; startRow: number }[], nameCapture: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  // Group: each name capture collects all modifier captures at the same startRow
  const byRow = new Map<number, { names: string[]; modifiers: string[] }>();
  for (const cap of captures) {
    const row = cap.startRow;
    if (!byRow.has(row)) byRow.set(row, { names: [], modifiers: [] });
    const entry = byRow.get(row)!;
    if (cap.name === 'modifier') {
      entry.modifiers.push(cap.text);
    } else if (cap.name === nameCapture) {
      entry.names.push(cap.text);
    }
  }
  for (const [, entry] of byRow) {
    const modSet = new Set(entry.modifiers);
    for (const name of entry.names) {
      // Merge if the same name appears at multiple rows (shouldn't happen, but safe)
      const existing = map.get(name);
      if (existing) {
        for (const m of modSet) existing.add(m);
      } else {
        map.set(name, new Set(modSet));
      }
    }
  }
  return map;
}

export async function extractCsharpExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Build modifier lookup maps (separate queries to avoid cross-product duplicates)
  const classModCaptures = await runQuery(language, tree, CLASS_MODIFIER_QUERY);
  const classModMap = buildModifierMap(classModCaptures, 'class_name');

  const methodModCaptures = await runQuery(language, tree, METHOD_MODIFIER_QUERY);
  const methodModMap = buildModifierMap(methodModCaptures, 'method_name');

  // Classes
  const classCaptures = await runQuery(language, tree, CLASS_QUERY);
  for (const cap of classCaptures) {
    if (cap.name === 'class_name') {
      const modifiers = classModMap.get(cap.text);
      symbols.push({
        name: cap.text,
        kind: 'class',
        signature: `class ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: modifiers?.has('public') ?? false,
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
      const modifiers = methodModMap.get(cap.text);
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `${retCap?.text || 'void'} ${cap.text}${truncate(paramsCap?.text || '()', 60)}`,
        filePath,
        line: cap.startRow + 1,
        isExported: modifiers?.has('public') ?? false,
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

  // Build modifier lookup maps
  const ifaceModCaptures = await runQuery(language, tree, INTERFACE_MODIFIER_QUERY);
  const ifaceModMap = buildModifierMap(ifaceModCaptures, 'iface_name');

  const enumModCaptures = await runQuery(language, tree, ENUM_MODIFIER_QUERY);
  const enumModMap = buildModifierMap(enumModCaptures, 'enum_name');

  // Interfaces
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
  for (const cap of ifaceCaptures) {
    if (cap.name === 'iface_name') {
      const modifiers = ifaceModMap.get(cap.text);
      types.push({
        name: cap.text,
        kind: 'interface',
        fields: [],
        filePath,
        line: cap.startRow + 1,
        isExported: modifiers?.has('public') ?? false,
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
      const modifiers = enumModMap.get(cap.text);
      types.push({
        name: cap.text,
        kind: 'enum',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: modifiers?.has('public') ?? false,
        language,
      });
    }
  }

  return types;
}

export function parseCsharpEnumBody(bodyText: string): TypeField[] {
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

