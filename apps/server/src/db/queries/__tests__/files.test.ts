import * as schema from '@caesar/shared/db/schema';
import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, test } from 'vitest';
import { FILE_REFERENCES } from '../files';

const columnKey = (table: SQLiteTable, column: string) =>
  `${getTableConfig(table).name}.${column}`;

describe('FILE_REFERENCES', () => {
  // A table that references files but is missing from the list would have
  // its files swept by the orphan cleanup cron while still in use.
  test('covers every foreign key to files in the schema', () => {
    const schemaRefs: string[] = [];

    for (const value of Object.values(schema)) {
      if (!is(value, SQLiteTable)) continue;

      for (const fk of getTableConfig(value).foreignKeys) {
        const ref = fk.reference();

        if (ref.foreignTable !== schema.files) continue;

        for (const column of ref.columns) {
          schemaRefs.push(columnKey(value, column.name));
        }
      }
    }

    const listed = FILE_REFERENCES.map((column) =>
      columnKey(column.table, column.name)
    );

    expect(schemaRefs.length).toBeGreaterThan(0);
    expect(new Set(listed)).toEqual(new Set(schemaRefs));
  });
});
