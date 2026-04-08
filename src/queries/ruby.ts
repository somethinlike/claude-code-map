import type { ExtractedSymbol, ExtractedType, ExtractedRoute, ExtractedImport, TypeField, SupportedLanguage } from '../types.ts';
import { runQuery } from '../parser.ts';
import { truncate } from '../utils.ts';

// Ruby: all top-level methods and classes are accessible.
// Methods starting with _ are conventional private.
// `private`, `protected` keywords change visibility for subsequent methods.

const METHOD_QUERY = `
(method
  name: (identifier) @fn_name
  parameters: (method_parameters)? @fn_params)
`;

const CLASS_QUERY = `
(class
  name: [(constant) (scope_resolution)] @class_name
  body: (body_statement)? @class_body)
`;

const MODULE_QUERY = `
(module
  name: [(constant) (scope_resolution)] @module_name)
`;

const SINGLETON_METHOD_QUERY = `
(singleton_method
  object: [(self) (constant)] @self_ref
  name: (identifier) @method_name
  parameters: (method_parameters)? @method_params)
`;

// Rails routes: get '/path', to: 'controller#action'
const RAILS_ROUTE_QUERY = `
(call
  method: (identifier) @http_method
  arguments: (argument_list
    (string) @route_path))
`;

export async function extractRubyExports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedSymbol[]> {
  const symbols: ExtractedSymbol[] = [];

  // Top-level methods
  const fnCaptures = await runQuery(language, tree, METHOD_QUERY);
  for (let i = 0; i < fnCaptures.length; i++) {
    const cap = fnCaptures[i];
    if (cap.name === 'fn_name') {
      const isPrivate = cap.text.startsWith('_');
      const params = fnCaptures[i + 1]?.name === 'fn_params' ? fnCaptures[i + 1].text : '';
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `def ${cap.text}${params ? truncate(params, 60) : ''}`,
        filePath,
        line: cap.startRow + 1,
        isExported: !isPrivate,
        isDefault: false,
        language,
      });
    }
  }

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
        isExported: true,
        isDefault: false,
        language,
      });
    }
  }

  // Modules
  const moduleCaptures = await runQuery(language, tree, MODULE_QUERY);
  for (const cap of moduleCaptures) {
    if (cap.name === 'module_name') {
      symbols.push({
        name: cap.text,
        kind: 'class', // Closest analog
        signature: `module ${cap.text}`,
        filePath,
        line: cap.startRow + 1,
        isExported: true,
        isDefault: false,
        language,
      });
    }
  }

  // Singleton methods (self.method_name)
  const singletonCaptures = await runQuery(language, tree, SINGLETON_METHOD_QUERY);
  for (let i = 0; i < singletonCaptures.length; i++) {
    const cap = singletonCaptures[i];
    if (cap.name === 'method_name') {
      const params = singletonCaptures[i + 1]?.name === 'method_params' ? singletonCaptures[i + 1].text : '';
      // Avoid duplicates with regular method query
      if (symbols.some((s) => s.name === cap.text && s.filePath === filePath && s.line === cap.startRow + 1)) continue;
      symbols.push({
        name: cap.text,
        kind: 'method',
        signature: `def self.${cap.text}${params ? truncate(params, 60) : ''}`,
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

export async function extractRubyTypes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedType[]> {
  const types: ExtractedType[] = [];

  // Classes with attr_accessor/attr_reader as "fields"
  const classCaptures = await runQuery(language, tree, CLASS_QUERY);
  for (let i = 0; i < classCaptures.length; i++) {
    const cap = classCaptures[i];
    if (cap.name === 'class_name') {
      const bodyCapture = classCaptures[i + 1]?.name === 'class_body' ? classCaptures[i + 1] : null;
      const fields = bodyCapture ? parseRubyClassFields(bodyCapture.text) : [];
      if (fields.length > 0) {
        types.push({
          name: cap.text,
          kind: 'interface', // Closest analog
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

export async function extractRubyRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Only extract from routes.rb files
  if (!filePath.endsWith('routes.rb') && !filePath.includes('routes/')) return routes;

  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);
  const railsCaptures = await runQuery(language, tree, RAILS_ROUTE_QUERY);

  for (let i = 0; i < railsCaptures.length; i++) {
    const cap = railsCaptures[i];
    if (cap.name === 'http_method' && httpMethods.has(cap.text)) {
      const pathCap = railsCaptures[i + 1];
      if (pathCap?.name === 'route_path') {
        routes.push({
          method: cap.text.toUpperCase(),
          path: pathCap.text.replace(/['"]/g, ''),
          filePath,
          line: cap.startRow + 1,
          handler: '',
          auth: false,
          framework: 'rails',
        });
      }
    }
  }

  return routes;
}

export function parseRubyClassFields(bodyText: string): TypeField[] {
  const fields: TypeField[] = [];
  const lines = bodyText.split('\n');

  for (const line of lines) {
    // attr_accessor :name, :email
    const attrMatch = line.trim().match(/^attr_(?:accessor|reader|writer)\s+(.+)/);
    if (attrMatch) {
      const symbols = attrMatch[1].split(',').map((s) => s.trim().replace(/^:/, ''));
      for (const sym of symbols) {
        if (sym && !sym.startsWith('#')) {
          fields.push({
            name: sym,
            type: 'Object', // Ruby is dynamically typed
            optional: false,
          });
        }
      }
    }
  }

  return fields;
}

// --- Import Queries ---

const REQUIRE_CALL_QUERY = `
(call
  method: (identifier) @_method
  arguments: (argument_list
    (string) @import_source))
`;

export async function extractRubyImports(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedImport[]> {
  const imports: ExtractedImport[] = [];
  const seen = new Set<string>();

  // require 'json', require_relative './helper'
  const captures = await runQuery(language, tree, REQUIRE_CALL_QUERY);
  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    if (cap.name === '_method' && (cap.text === 'require' || cap.text === 'require_relative')) {
      const sourceCap = captures[i + 1];
      if (sourceCap?.name === 'import_source') {
        const source = sourceCap.text.replace(/['"]/g, '');
        if (!seen.has(source)) {
          seen.add(source);
          imports.push({
            source,
            resolvedPath: null,
            filePath,
            line: sourceCap.startRow + 1,
            isExternal: cap.text !== 'require_relative', // require_relative is always local
            language,
          });
        }
      }
    }
  }

  return imports;
}
