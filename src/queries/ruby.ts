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

// Rails route DSL has three primary forms:
//   1. `get '/path', to: 'controller#action'`     — string path
//   2. `get :feed, on: :collection`               — symbol path (shortcut for /feed)
//   3. `resources :articles [, only: [...]]`      — REST resource expanding to 7 routes
//      `resource :user [, only: [...]]`           — singular resource (6 routes, no index)
// Each form has a different argument shape so we use multiple queries.

const RAILS_STRING_ROUTE_QUERY = `
(call
  method: (identifier) @http_method
  arguments: (argument_list
    (string) @route_path))
`;

const RAILS_SYMBOL_ROUTE_QUERY = `
(call
  method: (identifier) @http_method
  arguments: (argument_list
    (simple_symbol) @route_symbol))
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

// REST actions generated by `resources :name`. Plural form (7 routes).
const REST_PLURAL_ACTIONS: ReadonlyArray<{ action: string; method: string; suffix: string }> = [
  { action: 'index',   method: 'GET',    suffix: '' },
  { action: 'new',     method: 'GET',    suffix: '/new' },
  { action: 'create',  method: 'POST',   suffix: '' },
  { action: 'show',    method: 'GET',    suffix: '/:id' },
  { action: 'edit',    method: 'GET',    suffix: '/:id/edit' },
  { action: 'update',  method: 'PATCH',  suffix: '/:id' },
  { action: 'destroy', method: 'DELETE', suffix: '/:id' },
];

// REST actions generated by `resource :name` (singular). 6 routes — no index,
// no `:id` because there's only one of these per parent.
const REST_SINGULAR_ACTIONS: ReadonlyArray<{ action: string; method: string; suffix: string }> = [
  { action: 'new',     method: 'GET',    suffix: '/new' },
  { action: 'create',  method: 'POST',   suffix: '' },
  { action: 'show',    method: 'GET',    suffix: '' },
  { action: 'edit',    method: 'GET',    suffix: '/edit' },
  { action: 'update',  method: 'PATCH',  suffix: '' },
  { action: 'destroy', method: 'DELETE', suffix: '' },
];

function stripRubySymbol(text: string): string {
  return text.replace(/^:/, '');
}

/**
 * Walk the source text of a `resources :foo, only: [:show]` call and return
 * the action filter. Looks for `only: [...]` or `except: [...]` and parses
 * the symbol list. Returns empty filter if neither is present.
 *
 * IMPORTANT: this function only looks at the top-level call arguments —
 * everything from the `do` keyword onward is stripped first so filter
 * parsing doesn't pick up `only:`/`except:` from nested resources/resource
 * calls inside the block. Nested filters in nested calls are handled by
 * their own iteration of the captures loop.
 */
function parseActionFilter(callText: string): { only?: Set<string>; except?: Set<string> } {
  const result: { only?: Set<string>; except?: Set<string> } = {};
  // Strip the do...end block (and the `do` keyword itself) before parsing.
  // The block contains nested calls whose filters would otherwise leak in.
  const argsText = callText.replace(/\s+do\b[\s\S]*$/, '');
  const onlyMatch = argsText.match(/only:\s*\[([^\]]+)\]/);
  if (onlyMatch) {
    result.only = new Set(
      onlyMatch[1].split(',').map((s) => s.trim().replace(/^:/, '')),
    );
  }
  const exceptMatch = argsText.match(/except:\s*\[([^\]]+)\]/);
  if (exceptMatch) {
    result.except = new Set(
      exceptMatch[1].split(',').map((s) => s.trim().replace(/^:/, '')),
    );
  }
  return result;
}

function isActionAllowed(action: string, filter: { only?: Set<string>; except?: Set<string> }): boolean {
  if (filter.only && !filter.only.has(action)) return false;
  if (filter.except && filter.except.has(action)) return false;
  return true;
}

const RAILS_DSL_QUERY = `
(call
  method: (identifier) @dsl_method
  arguments: (argument_list
    (simple_symbol) @resource_name)) @dsl_call
`;

export async function extractRubyRoutes(
  tree: any,
  language: SupportedLanguage,
  filePath: string,
): Promise<ExtractedRoute[]> {
  const routes: ExtractedRoute[] = [];

  // Only extract from routes.rb files
  if (!filePath.endsWith('routes.rb') && !filePath.includes('routes/')) return routes;

  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  // 1. String paths: `get '/path', to: 'foo#bar'`
  const stringCaptures = await runQuery(language, tree, RAILS_STRING_ROUTE_QUERY);
  for (let i = 0; i < stringCaptures.length; i++) {
    const cap = stringCaptures[i];
    if (cap.name === 'http_method' && httpMethods.has(cap.text)) {
      const pathCap = stringCaptures[i + 1];
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

  // 2. Symbol paths: `get :feed` (shortcut for /feed)
  // 3. resources / resource: REST resource synthesis
  const dslCaptures = await runQuery(language, tree, RAILS_DSL_QUERY);
  for (let i = 0; i < dslCaptures.length; i++) {
    const cap = dslCaptures[i];
    if (cap.name !== 'dsl_method') continue;

    const symbolCap = dslCaptures.find((c, j) => j > i && c.name === 'resource_name');
    if (!symbolCap) continue;
    const name = stripRubySymbol(symbolCap.text);
    const line = cap.startRow + 1;

    if (httpMethods.has(cap.text)) {
      // Form 2: `get :feed` → GET /feed
      routes.push({
        method: cap.text.toUpperCase(),
        path: '/' + name,
        filePath,
        line,
        handler: '',
        auth: false,
        framework: 'rails',
      });
    } else if (cap.text === 'resources' || cap.text === 'resource') {
      // Form 3: synthesize the REST routes from the action template.
      // The @dsl_call capture is the full `resources :name, only: [...]`
      // call expression — its .text spans the whole thing including the
      // only:/except: filters. The dsl_call capture sits at the same row
      // as dsl_method (one wraps the other), so we match by row position
      // rather than relying on capture array order.
      const callCap = dslCaptures.find(
        (c) => c.name === 'dsl_call' && c.startRow === cap.startRow,
      );
      const callText = callCap?.text ?? '';
      const filter = parseActionFilter(callText);

      const template = cap.text === 'resources' ? REST_PLURAL_ACTIONS : REST_SINGULAR_ACTIONS;
      for (const { action, method, suffix } of template) {
        if (!isActionAllowed(action, filter)) continue;
        routes.push({
          method,
          path: '/' + name + suffix,
          filePath,
          line,
          handler: action,
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
