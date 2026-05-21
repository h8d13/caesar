# Security

## Security Policy
  
### Supported Versions
Only the latest `master` is supported. Older tags receive no patches.
  
### Reporting a Vulnerability
Please **do not** open a public issue. hadean-eon-dev@proton.me
Or use GitHub's [private vulnerability reporting](https://github.com/h8d13/caesar/security/advisories/new).
Expect an initial response within 24 hours.

## Auditabilty

- Main server setup: [index](apps/server/src/http/index.ts)

> Sec headers here contain many "hardening" ideas. CSP, CORS, COOP/CORP.
> Same-origin, X-frame, explicit permissions.
> Referrer policy, HSTS w/ includeSubDomains

HTTPS enforcement: behind Caddy, server 301s any `x-forwarded-proto: http`

- AuthN: argon2 password hashing (`apps/server/src/utils/password.ts`).
- AuthZ: tRPC `protectedProcedure` + permission middleware (`apps/server/src/utils/trpc.ts`).
- Rate limiting: per-IP token bucket on tRPC procedures and login (`apps/server/src/utils/rate-limiters/`).
- Zod escaping and normalization.
- Invite only model, opaque by design.
- Operator vs Admin model: An 'admin' never gets IP or GEO. Only hashes. Operator still has full logs.
