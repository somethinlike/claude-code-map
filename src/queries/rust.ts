import type { ExtractedSymbol, ExtractedType, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';

// Rust exports are determined by `pub` visibility modifier.

const FUNCTION_QUERY = `
(function_item
  (visibility_modifier)? @visibility
  name: (identifier) @fn_name
  parameters: (parameters) @fn_params
  return_type: (_)? @fn_return)
`;

const STRUCT_QUERY = `
(struct_item
  (visibility_modifier)? @visibility
  name: (type_identifier) @struct_name
  body: (field_declaration_list)? @struct_fields)
`;

const ENUM_QUERY = `
(enum_item
  (visibility_modifier)? @visibility
  name: (type_identifier) @enum_name
  body: (enum_variant_list) @enum_variants)
`;

const IMPL_METHOD_QUERY = `
(impl_item
  type: (type_identifier) @impl_type
  body: (declaration_list
    (function_item
      (visibility_modifier)? @method_vis
      name: (identifier) @method_name
      parameters: (parameters) @method_params)))
`;

const TRAIT_QUERY = `
(trait_item
  (visibility_modifier)? @visibility
  name: (type_identifier) @trait_name)
`;

export async function extractRustExports(
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
      const visCap = fnCaptures.find((c, j) => j < i && c.name === 'visibility' && cap.startRow - c.startRow < 3);
      const isExported = visCap?.text?.includes('pub') ?? false;
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      const ret = fnCaptures[i + 2]?.name === 'fn_return' ? ` -> ${fnCaptures[i + 2].text}` : '';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `fn ${cap.text}${truncate(params, 60)}${ret}`,
        filePath,
        line: cap.startRow + 1,
        isExported,
        isDefault: false,
        language,
      });
    }
  }

  return symbols;
}

export async function extractRustTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  const types: ExtractedType[] = [];

  // Structs
  const structCaptures = await runQuery(language, tree, STRUCT_QUERY);
  for (let i = 0; i < structCaptures.length; i++) {
    const cap = structCaptures[i];
    if (cap.name === 'struct_name') {
      const visCap = structCaptures.find((c, j) => j < i && c.name === 'visibility' && cap.startRow - c.startRow < 3);
      const fieldsCap = structCaptures[i + 1]?.name === 'struct_fields' ? structCaptures[i + 1] : null;
      const fields = fieldsCap ? parseRustStructFields(fieldsCap.text) : [];
      types.push({
        name: cap.text,
        kind: 'interface',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: visCap?.text?.includes('pub') ?? false,
        language,
      });
    }
  }

  // Enums
  const enumCaptures = await runQuery(language, tree, ENUM_QUERY);
  for (let i = 0; i < enumCaptures.length; i++) {
    const cap = enumCaptures[i];
    if (cap.name === 'enum_name') {
      const visCap = enumCaptures.find((c, j) => j < i && c.name === 'visibility' && cap.startRow - c.startRow < 3);
      const variantsCap = enumCaptures[i + 1]?.name === 'enum_variants' ? enumCaptures[i + 1] : null;
      const fields = variantsCap ? parseRustEnumVariants(variantsCap.text) : [];
      types.push({
        name: cap.text,
        kind: 'enum',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: visCap?.text?.includes('pub') ?? false,
        language,
      });
    }
  }

  // Traits
  const traitCaptures = await runQuery(language, tree, TRAIT_QUERY);
  for (let i = 0; i < traitCaptures.length; i++) {
    const cap = traitCaptures[i];
    if (cap.name === 'trait_name') {
      const visCap = traitCaptures.find((c, j) => j < i && c.name === 'visibility' && cap.startRow - c.startRow < 3);
      types.push({
        name: cap.text,
        kind: 'interface',
        fields: [],
        filePath,
        line: cap.startRow + 1,
        isExported: visCap?.text?.includes('pub') ?? false,
        language,
      });
    }
  }

  return types;
}

function parseRustStructFields(fieldsText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = fieldsText.replace(/^\{/, '').replace(/\}$/, '').trim();
  const lines = inner.split(',').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/(?:pub\s+)?(\w+)\s*:\s*(.+)/);
    if (match) {
      fields.push({
        name: match[1],
        type: match[2].trim(),
        optional: match[2].includes('Option<'),
      });
    }
  }

  return fields;
}

function parseRustEnumVariants(variantsText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = variantsText.replace(/^\{/, '').replace(/\}$/, '').trim();
  const variants = inner.split(',').map((v) => v.trim()).filter(Boolean);

  for (const variant of variants) {
    const name = variant.split(/[\s({]/)[0].trim();
    if (name) {
      fields.push({ name, type: 'variant', optional: false });
    }
  }

  return fields;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
