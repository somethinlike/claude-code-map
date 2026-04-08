import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// Go exports are determined by capitalization of the first letter.

const FUNCTION_QUERY = `
(function_declaration
  name: (identifier) @fn_name
  parameters: (parameter_list) @fn_params
  result: (_)? @fn_return)
`;

const METHOD_QUERY = `
(method_declaration
  receiver: (parameter_list) @receiver
  name: (field_identifier) @method_name
  parameters: (parameter_list) @method_params
  result: (_)? @method_return)
`;

const STRUCT_QUERY = `
(type_declaration
  (type_spec
    name: (type_identifier) @struct_name
    type: (struct_type
      (field_declaration_list) @struct_fields)))
`;

const INTERFACE_QUERY = `
(type_declaration
  (type_spec
    name: (type_identifier) @iface_name
    type: (interface_type) @iface_body))
`;

const HTTP_ROUTE_QUERY = `
(call_expression
  function: (selector_expression
    operand: (identifier) @router_obj
    field: (field_identifier) @http_method)
  arguments: (argument_list
    (interpreted_string_literal) @route_path))
`;

export async function extractGoExports(
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
      const isExported = cap.text[0] === cap.text[0].toUpperCase();
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '()';
      const ret = fnCaptures[i + 2]?.name === 'fn_return' ? ` ${fnCaptures[i + 2].text}` : '';
      symbols.push({
        name: cap.text,
        kind: 'function',
        signature: `func ${cap.text}${truncate(params, 60)}${ret}`,
        filePath,
        line: cap.startRow + 1,
        isExported,
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
      const isExported = cap.text[0] === cap.text[0].toUpperCase();
      const receiver = methodCaptures.find((c, j) => j < i && c.name === 'receiver');
      const params = methodCaptures[i + 1]?.name === 'method_params' ? methodCaptures[i + 1].text : '()';
      const receiverStr = receiver ? `(${receiver.text}) ` : '';
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `func ${receiverStr}${cap.text}${truncate(params, 60)}`,
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

export async function extractGoTypes(
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
      const fieldsCapture = structCaptures[i + 1]?.name === 'struct_fields' ? structCaptures[i + 1] : null;
      const fields = fieldsCapture ? parseGoStructFields(fieldsCapture.text) : [];
      types.push({
        name: cap.text,
        kind: 'interface',
        fields,
        filePath,
        line: cap.startRow + 1,
        isExported: cap.text[0] === cap.text[0].toUpperCase(),
        language,
      });
    }
  }

  // Interfaces
  const ifaceCaptures = await runQuery(language, tree, INTERFACE_QUERY);
  for (let i = 0; i < ifaceCaptures.length; i++) {
    const cap = ifaceCaptures[i];
    if (cap.name === 'iface_name') {
      types.push({
        name: cap.text,
        kind: 'interface',
        fields: [],
        filePath,
        line: cap.startRow + 1,
        isExported: cap.text[0] === cap.text[0].toUpperCase(),
        language,
      });
    }
  }

  return types;
}

export async function extractGoRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'HandleFunc', 'Handle']);
  const routes: ExtractedRoute[] = [];

  const captures = await runQuery(language, tree, HTTP_ROUTE_QUERY);
  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    if (cap.name === 'http_method' && HTTP_METHODS.has(cap.text)) {
      const pathCap = captures.find((c, j) => j > i && c.name === 'route_path');
      if (pathCap) {
        const method = cap.text === 'HandleFunc' || cap.text === 'Handle'
          ? 'ALL' : cap.text.toUpperCase();
        routes.push({
          method,
          path: pathCap.text.replace(/"/g, ''),
          filePath,
          line: cap.startRow + 1,
          handler: '',
          auth: false,
          framework: 'go-http',
        });
      }
    }
  }

  return routes;
}

export function parseGoStructFields(fieldsText: string): TypeField[] {
  const fields: TypeField[] = [];
  const inner = fieldsText.replace(/^\{/, '').replace(/\}$/, '').trim();
  const lines = inner.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    const match = line.trim().match(/^(\w+)\s+(\S+)/);
    if (match) {
      fields.push({
        name: match[1],
        type: match[2],
        optional: false,
      });
    }
  }

  return fields;
}

// --- Import Queries ---

const IMPORT_SPEC_QUERY = `
(import_spec
  path: (interpreted_string_literal) @import_source)
`;

export async function extractGoImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  const captures = await runQuery(language, tree, IMPORT_SPEC_QUERY);
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
          isExternal: true, // all Go imports are package paths; resolver checks go.mod later
          language,
        });
      }
    }
  }

  return imports;
}

