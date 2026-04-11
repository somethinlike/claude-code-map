import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

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

// Axum routes: .route("/path", verb(handler)) chained on Router::new().
// Captures the .route call and its second argument as a single node — we
// then post-process the argument text to extract every HTTP verb name in
// it (handles simple form `post(h)`, chained form `get(h).put(h)`, and
// qualified form `routing::post(h)` uniformly).
const AXUM_ROUTE_QUERY = `
(call_expression
  function: (field_expression
    field: (field_identifier) @method_name)
  arguments: (arguments
    (string_literal) @route_path
    (call_expression) @verb_arg))
`;

// Actix attribute macros: #[get("/path")], #[post("/path")] on a function
const ACTIX_ROUTE_QUERY = `
(attribute_item
  (attribute
    (identifier) @http_verb
    arguments: (token_tree
      (string_literal) @route_path)))
`;

const RUST_HTTP_VERBS: Record<string, string> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
  any: 'ALL',
};

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

export async function extractRustRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  function pushRoute(verbText: string, pathText: string, line: number, framework: string) {
    const verb = RUST_HTTP_VERBS[verbText.toLowerCase()];
    if (!verb) return;
    const path = pathText.replace(/^["']|["']$/g, '');
    routes.push({
      method: verb,
      path,
      filePath,
      line,
      handler: '',
      auth: false,
      framework,
    });
  }

  // Axum: .route("/path", verb(h)) and chained .route("/path", get(h).put(h))
  // The verb_arg capture is the entire second argument as a node — we
  // regex-extract every HTTP verb identifier from its text. This handles
  // simple, chained, and qualified-path forms uniformly.
  const verbWordRe = /\b(get|post|put|patch|delete|head|options|any)\s*\(/g;
  const axumCaptures = await runQuery(language, tree, AXUM_ROUTE_QUERY);
  for (let i = 0; i < axumCaptures.length; i++) {
    const cap = axumCaptures[i];
    if (cap.name !== 'method_name' || cap.text !== 'route') continue;
    const pathCap = axumCaptures.find((c, j) => j > i && c.name === 'route_path');
    const verbCap = axumCaptures.find((c, j) => j > i && c.name === 'verb_arg');
    if (!pathCap || !verbCap) continue;

    // Extract every verb token from the argument text. `route_layer(...)`
    // and similar non-verb wrappers are filtered by the verb whitelist.
    const seenVerbs = new Set<string>();
    let m: RegExpExecArray | null;
    verbWordRe.lastIndex = 0;
    while ((m = verbWordRe.exec(verbCap.text))) {
      const verb = m[1].toLowerCase();
      if (seenVerbs.has(verb)) continue;
      seenVerbs.add(verb);
      pushRoute(verb, pathCap.text, cap.startRow + 1, 'axum');
    }
  }

  // Actix: #[get("/path")] on a fn
  const actixCaptures = await runQuery(language, tree, ACTIX_ROUTE_QUERY);
  for (let i = 0; i < actixCaptures.length; i++) {
    const cap = actixCaptures[i];
    if (cap.name !== 'http_verb') continue;
    const pathCap = actixCaptures.find((c, j) => j > i && c.name === 'route_path');
    if (pathCap) pushRoute(cap.text, pathCap.text, cap.startRow + 1, 'actix');
  }

  return routes;
}

export function parseRustStructFields(fieldsText: string): TypeField[] {
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

export function parseRustEnumVariants(variantsText: string): TypeField[] {
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

// --- Import Queries ---

const USE_QUERY = `
(use_declaration
  argument: (_) @import_source)
`;

const EXTERN_CRATE_QUERY = `
(extern_crate_declaration
  name: (identifier) @import_source)
`;

export async function extractRustImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // use statements: use std::collections::HashMap, use crate::module::Thing
  const useCaptures = await runQuery(language, tree, USE_QUERY);
  for (const cap of useCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        const isLocal = source.startsWith('crate::') || source.startsWith('super::') || source.startsWith('self::');
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

  // extern crate declarations
  const externCaptures = await runQuery(language, tree, EXTERN_CRATE_QUERY);
  for (const cap of externCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: true,
          language,
        });
      }
    }
  }

  return imports;
}

