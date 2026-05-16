// schema lives in @caesar/shared so type derivations in shared/tables.ts
// don't need to reach into apps/server. This shim keeps existing
// @server/db/schema imports working; rewrite to @caesar/shared/db/schema
// at your leisure.
export * from '@caesar/shared/db/schema';
