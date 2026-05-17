// Single source of truth for how a user-typed identity becomes its
// canonical form. Used by the server zod schema at the /login boundary
// and by every client-side caller that does a key derivation, lookup,
// or comparison involving identity. Keep these aligned: any drift
// silently breaks deterministic key derivation and account matching.
export const canonicalIdentity = (s: string): string => s.trim().toLowerCase();
