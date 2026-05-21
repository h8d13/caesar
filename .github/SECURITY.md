# Security

## Policy
  
### Supported Versions
Only the latest `master` is supported. Older tags receive no patches.
  
### Reporting a Vulnerability
Please **do not** open a public issue. hadean-eon-dev@proton.me

Or use GitHub's [private vulnerability reporting](https://github.com/h8d13/caesar/security/advisories/new).

> Expect an initial response **within 24 hours**.

## Auditability

- Main server setup: [index](apps/server/src/http/index.ts)

> Sec headers here contain many "hardening" ideas: CSP/nonces, CORS, COOP/CORP.
> Same-origin, X-frame, explicit permissions.
> Referrer policy, HSTS w/ includeSubDomains

HTTPS enforcement: behind Caddy, server 301s any `x-forwarded-proto: http`

- AuthN: argon2 password hashing (`apps/server/src/utils/password.ts`).
- AuthZ: tRPC `protectedProcedure` + permission middleware (`apps/server/src/utils/trpc.ts`).
- 2FA: Only through hardware backed keys (`apps/server/src/utils/webauthn.ts`)
- Rate limiting: per-IP token bucket on tRPC procedures and login (`apps/server/src/utils/rate-limiters/`).
- Zod escaping and normalization.

## 3rd party

- Deps are validated in [Renovate](https://github.com/h8d13/caesar/blob/master/renovate.json)
- With vulnerabilty alerts enabled and frozen to 3 days minimum release.
- If a vuln is external please report to appropriate repo and channel. We may also downgrade/take minor patch.

## Threat-model

- Invite only model (24 chars crypto), opaque by design on endpoints.
- Operator vs Admin: An 'admin'(or equivalent role) never gets IP or GEO. Only hashes.
- Operator still has full logs. (Aside from 1:1 DMs where he only sees blobs in DB)
- Made for smaller trusted communities, not for public exposure.
