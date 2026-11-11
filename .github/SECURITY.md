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
- Operator still has full logs, and can read all channel messages and default 1:1 DMs (stored as plaintext, searchable server-side).
- 1:1 DMs are E2EE only in ephemeral mode: for those the operator sees only ciphertext, plus metadata (sender, time, file names/sizes). The DM header shows which mode is on.
- Peer public keys are served by the server and not pinned: E2EE holds against an honest operator reading their own DB/logs, not against one who tampers with it.
- Off-site images in messages are fetched by the server (`/proxy/image`, members only) and off-site video/audio never load: posting a link does not reveal viewers' IPs to the poster. The CSP `img-src` enforces it; only Giphy, the built-in emoji image sets and YouTube thumbnails are loaded directly.
- The image proxy sees the image URLs it is asked for, including those inside E2EE DMs once a participant views them.
- Made for smaller trusted communities, not for public exposure.
- Generic exposure (I.e: notifications/search do not leak on lock-screens/E2EE)
