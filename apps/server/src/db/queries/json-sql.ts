import { files } from '@caesar/shared/db/schema';
import { Column, getTableColumns, is, sql, SQL } from 'drizzle-orm';
import { alias, SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';

// Builders for queries that let SQLite assemble the nested wire shape
// (json_object / json_group_array) instead of fetching flat rows and
// regrouping them in JS. One JSON string per row skips drizzle's per-row
// mapping, which dominates on joined reads (3x on a 100-message page).
//
// Inside json_object SQLite emits the stored form, so every column mode
// drizzle would decode after the query has to be decoded here instead.
// Unknown modes throw when the builder runs (module load for every
// caller), so a new column type cannot ship undecoded.

type TJsonField = Column | SQL;

const PLAIN_COLUMN_TYPES = new Set([
  'SQLiteInteger',
  'SQLiteReal',
  'SQLiteText'
]);

const jsonValue = (field: TJsonField): SQL => {
  if (!is(field, Column)) return field;

  if (PLAIN_COLUMN_TYPES.has(field.columnType)) return sql`${field}`;

  if (field.columnType === 'SQLiteBoolean') {
    return sql`CASE WHEN ${field} IS NULL THEN NULL
      WHEN ${field} THEN json('true') ELSE json('false') END`;
  }

  if (field.columnType === 'SQLiteTextJson') return sql`json(${field})`;

  throw new Error(
    `json-sql: no decoder for ${field.columnType} (${field.name})`
  );
};

// Keys are code constants, never input: inlined rather than bound.
const jsonObject = (fields: Record<string, TJsonField>): SQL =>
  sql`json_object(${sql.join(
    Object.entries(fields).map(
      ([key, field]) => sql`${sql.raw(`'${key}'`)}, ${jsonValue(field)}`
    ),
    sql`, `
  )})`;

// The JSON subtype does not survive a subquery boundary: without json()
// the parent would embed nested results as escaped strings.
const jsonArrayOf = (element: SQL, from: SQL): SQL =>
  sql`json((SELECT json_group_array(${element}) ${from}))`;

const jsonOneOf = (element: SQL, from: SQL): SQL =>
  sql`json((SELECT ${element} ${from}))`;

type TFileKey = keyof (typeof files)['_']['columns'];

const FILE_KEYS = Object.keys(getTableColumns(files)) as TFileKey[];

// keyed lookups so an alias(files, ...) renders its own column names
const fileJson = (table: Record<TFileKey, Column>) =>
  jsonObject(Object.fromEntries(FILE_KEYS.map((key) => [key, table[key]])));

// File row by id as an object, or null: avatar, banner, custom emoji.
// `name` must be unique per query since it aliases the files table.
const fileByIdJson = (name: string, fileId: Column) => {
  const file = alias(files, name);

  return jsonOneOf(
    fileJson(file),
    sql`FROM ${files} AS ${sql.identifier(name)} WHERE ${file.id} = ${fileId}`
  );
};

const dialect = new SQLiteAsyncDialect();

// drizzle re-renders a sql tree on every execution; for these wide nested
// selects that rendering cost more than the query. Fragments are built
// from columns and inlined constants only, so render once at module load.
const precompile = (fragment: SQL): SQL => {
  const { sql: text, params } = dialect.sqlToQuery(fragment);

  if (params.length > 0) {
    throw new Error('json-sql: precompile needs a fragment without params');
  }

  return sql.raw(text);
};

const parseJson = <T>(value: unknown): T => JSON.parse(value as string) as T;

export {
  fileByIdJson,
  fileJson,
  jsonArrayOf,
  jsonObject,
  jsonOneOf,
  parseJson,
  precompile
};
