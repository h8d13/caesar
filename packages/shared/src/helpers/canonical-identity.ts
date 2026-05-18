// Single source of truth for how a user-typed identity becomes its
// canonical form. Used by the server zod schema at the /login boundary
// and by every client-side caller that does a key derivation, lookup,
// or comparison involving identity. Keep these aligned: any drift
// silently breaks deterministic key derivation and account matching.
export const canonicalIdentity = (s: string): string => s.trim().toLowerCase();

// First char must be a Unicode letter or digit; following chars allow
// letter/digit/_/-. Caps at 32 chars. Enforced on signup (registerUser)
// and admin rename (users.renameIdentity). Existing identities that
// predate this validation are grandfathered.
export const IDENTITY_REGEX = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}$/u;
