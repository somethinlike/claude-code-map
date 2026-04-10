import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
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

// ASP.NET Core controller routing.
// Class-level [Route("base")] sets a path prefix for all methods.
// Method-level [HttpGet]/[HttpPost("/path")]/etc. declare individual routes.
// Bare and with-path forms have different parse trees so we use two queries
// and dedupe by method name (mirroring the Kotlin/Java Spring pattern).
const ASPNET_METHOD_PATH_QUERY = `
(method_declaration
  (attribute_list
    (attribute
      name: (identifier) @attr_name
      (attribute_argument_list
        (attribute_argument
          (string_literal) @route_path))))
  name: (identifier) @method_name)
`;

const ASPNET_METHOD_MARKER_QUERY = `
(method_declaration
  (attribute_list
    (attribute
      name: (identifier) @attr_name))
  name: (identifier) @method_name)
`;

const ASPNET_CLASS_ROUTE_QUERY = `
(class_declaration
  (attribute_list
    (attribute
      name: (identifier) @attr_name
      (attribute_argument_list
        (attribute_argument
          (string_literal) @class_path))))
  name: (identifier) @class_name)
`;

// Map ASP.NET attribute names to HTTP methods.
const ASPNET_HTTP_METHODS: Record<string, string> = {
  HttpGet: 'GET',
  HttpPost: 'POST',
  HttpPut: 'PUT',
  HttpPatch: 'PATCH',
  HttpDelete: 'DELETE',
  HttpHead: 'HEAD',
  HttpOptions: 'OPTIONS',
  Route: 'ALL',
};

function stripCsharpString(text: string): string {
  return text.replace(/^["']|["']$/g, '');
}

function joinAspnetPaths(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  if (!b && !p) return '/';
  if (!b) return '/' + p;
  if (!p) return '/' + b;
  return '/' + b + '/' + p;
}

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

export async function extractCsharpRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Class-level [Route("base")] — used as a prefix for all methods in the class.
  let basePath = '';
  const classCaptures = await runQuery(language, tree, ASPNET_CLASS_ROUTE_QUERY);
  for (let i = 0; i < classCaptures.length; i++) {
    const cap = classCaptures[i];
    if (cap.name === 'attr_name' && cap.text === 'Route') {
      const pathCap = classCaptures.find((c, j) => j > i && c.name === 'class_path');
      if (pathCap) {
        basePath = stripCsharpString(pathCap.text);
        break;
      }
    }
  }

  // Methods with explicit path: [HttpGet("feed")]
  const pathCaptures = await runQuery(language, tree, ASPNET_METHOD_PATH_QUERY);
  for (let i = 0; i < pathCaptures.length; i++) {
    const cap = pathCaptures[i];
    if (cap.name !== 'attr_name' || !ASPNET_HTTP_METHODS[cap.text]) continue;

    const pathCap = pathCaptures.find((c, j) => j > i && j < i + 3 && c.name === 'route_path');
    const methodCap = pathCaptures.find((c, j) => j > i && c.name === 'method_name');
    const path = pathCap ? stripCsharpString(pathCap.text) : '';
    routes.push({
      method: ASPNET_HTTP_METHODS[cap.text],
      path: joinAspnetPaths(basePath, path),
      filePath,
      line: cap.startRow + 1,
      handler: methodCap?.text || '',
      auth: false,
      framework: 'aspnet',
    });
  }

  // Bare attribute form: [HttpGet] (path inherited from class-level [Route])
  const markerCaptures = await runQuery(language, tree, ASPNET_METHOD_MARKER_QUERY);
  for (let i = 0; i < markerCaptures.length; i++) {
    const cap = markerCaptures[i];
    if (cap.name !== 'attr_name' || !ASPNET_HTTP_METHODS[cap.text]) continue;
    if (cap.text === 'Route') continue; // class-level only

    const methodCap = markerCaptures.find((c, j) => j > i && c.name === 'method_name');
    const handler = methodCap?.text || '';

    // Skip if a path-form route already covers this handler
    if (routes.some((r) => r.handler === handler && r.line === cap.startRow + 1)) continue;

    routes.push({
      method: ASPNET_HTTP_METHODS[cap.text],
      path: joinAspnetPaths(basePath, ''),
      filePath,
      line: cap.startRow + 1,
      handler,
      auth: false,
      framework: 'aspnet',
    });
  }

  return routes;
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

// --- Import Queries ---

const USING_IDENTIFIER_QUERY = `
(using_directive
  (identifier) @import_source)
`;

const USING_QUALIFIED_QUERY = `
(using_directive
  (qualified_name) @import_source)
`;

export async function extractCsharpImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // using System;
  const identCaptures = await runQuery(language, tree, USING_IDENTIFIER_QUERY);
  for (const cap of identCaptures) {
    if (cap.name === 'import_source') {
      const source = cap.text.replace(/['"]/g, '');
      if (!seen.has(source)) {
        seen.add(source);
        imports.push({
          source,
          resolvedPath: null,
          filePath,
          line: cap.startRow + 1,
          isExternal: true, // all C# usings are namespace paths; resolver determines locality later
          language,
        });
      }
    }
  }

  // using System.Collections.Generic;
  const qualCaptures = await runQuery(language, tree, USING_QUALIFIED_QUERY);
  for (const cap of qualCaptures) {
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

