import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedModel, SchemaField, CodemapConfig } from '../types.ts';
import { ORM_AUDIT_COLUMNS } from '../types.ts';

export async function extractSchema(
  projectRoot: string,
  config: CodemapConfig,
): Promise<ExtractedModel[]> {
  const models: ExtractedModel[] = [];

  // Check explicit schema paths from config
  for (const schemaPath of config.schema) {
    const fullPath = join(projectRoot, schemaPath);
    if (existsSync(fullPath)) {
      if (schemaPath.endsWith('.prisma')) {
        models.push(...parsePrismaSchema(fullPath));
      }
    }
  }

  // Auto-detect Prisma if no explicit schema configured
  if (config.schema.length === 0) {
    const prismaLocations = [
      'prisma/schema.prisma',
      'schema.prisma',
      'prisma/schema/schema.prisma',
    ];

    for (const loc of prismaLocations) {
      const fullPath = join(projectRoot, loc);
      if (existsSync(fullPath)) {
        models.push(...parsePrismaSchema(fullPath));
        break; // Use first found
      }
    }
  }

  return models;
}

function parsePrismaSchema(filePath: string): ExtractedModel[] {
  const models: ExtractedModel[] = [];
  let source: string;

  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    return models;
  }

  const lines = source.split('\n');
  let currentModel: string | null = null;
  let currentFields: SchemaField[] = [];
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Model start
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      currentFields = [];
      braceDepth = 1;
      continue;
    }

    // Enum start (skip enums in schema extraction)
    if (trimmed.match(/^enum\s+\w+\s*\{/)) {
      braceDepth = 1;
      currentModel = null;
      continue;
    }

    // Track braces
    if (braceDepth > 0) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      if (braceDepth === 0 && currentModel) {
        models.push({
          name: currentModel,
          fields: currentFields,
          filePath: filePath.replace(/\\/g, '/'),
          orm: 'prisma',
        });
        currentModel = null;
        continue;
      }

      if (!currentModel) continue;

      // Parse field line
      if (trimmed.startsWith('//') || trimmed.startsWith('@@') || trimmed === '') continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+([\w\[\]?]+)/);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];

      // Skip ORM-managed audit columns unless they have special attributes
      const isPK = trimmed.includes('@id');
      const isUQ = trimmed.includes('@unique');
      if (ORM_AUDIT_COLUMNS.has(fieldName) && !isPK && !isUQ) continue;

      const attributes: string[] = [];
      if (isPK) attributes.push('PK');
      if (isUQ) attributes.push('UQ');
      if (fieldName.endsWith('Id') || fieldName.endsWith('_id')) attributes.push('FK');
      if (trimmed.includes('@relation')) attributes.push('relation');

      const isRelation = trimmed.includes('@relation') || (
        fieldType[0] === fieldType[0].toUpperCase() &&
        !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'].includes(fieldType.replace(/[\[\]?]/g, ''))
      );

      currentFields.push({
        name: fieldName,
        type: fieldType,
        required: !fieldType.includes('?'),
        isRelation,
        attributes,
      });
    }
  }

  return models;
}
