export interface SchemaField {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly isRelation: boolean;
  readonly attributes: readonly string[]; // PK, UQ, FK, etc.
}

export interface ExtractedModel {
  readonly name: string;
  readonly fields: readonly SchemaField[];
  readonly filePath: string;
  readonly orm: string; // prisma, django, sqlalchemy, drizzle, etc.
}

// ORM-managed audit columns (createdAt/updatedAt/deletedAt + snake_case
// variants). The schema extractor skips these when listing user-defined
// fields in schema.md — they're boilerplate, not domain data.
export const ORM_AUDIT_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'isDeleted',
  'created_at',
  'updated_at',
  'deleted_at',
  'is_deleted',
]);
