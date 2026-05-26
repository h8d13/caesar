# Changelog

> Fork point: `43eb3a7c` from https://github.com/Sharkord/sharkord

## Editor & content

- Whiteboards adapted from MIT-licensed https://github.com/Biplo12/BoardFlow
  - Add arrow / snap-to-grid to whiteboards
- Markdown to HTML using `marked`
- Syntax-highlighted code blocks using `highlight.js`
- Links show an external-navigation warning
- Audio / video preview
- Client-side embeds for links
- Add support for YT shorts / lives / etc. to preview
- Add ability to mention channels using `#` and `@` for user mentions + notifications
- Watch party: share a YouTube stream synced live to every connected client
  - Prediction pools: stake social credit on outcomes; optional timed challenge

## Messaging & DMs

- Search messages (DMs and global)
- DMs / mentions fixes / direct reply
- Added 1:1 calls in DMs
  - Fix on 1:1 call: focus DM panel + top-bar voice controls
- Bulk "Delete entire conversation" trash icon in DM top bar
- `Read at HH:MM` opt-in via Notifications tab
- Suppress typing signal when sender is offline
- Ephemeral mode in DMs (msgs + files); encryption detail under Security
- Various DM fixes: no threads, no upvotes
- Fix emojis serving stale (customs not appended to recent or quick replies)
- Fix upvotes appearing twice for message groups

## Voice & streams

- Added voice indicator in left bar
- Allow "hide own stream" option
- 2 streams in view split horizontally instead of vertically
- Optional simulcast toggle in settings (spatial quality layers)
- Add `DTLN` noise suppression from upstream (alongside `RNNoise`); noise gate on by default
- Soundboard + volume controller (both soundboard and individual streams)
- Hook transport stats to actually reflect issues
- Fix stream encoding strategies; create media paused, then request
- Various race fixes (audio context)

## Accounts, auth & sessions

- Invite-only model: no user-chosen codes, invites use a random 24-char code
- Fix auto-login behavior (now also allows multiple tabs); if off, single session enforced
- Add "Security" tab allowing multiple sessions: default **OFF**
- Add session kick-out: list based on a hashed browser fingerprint
- Add WebAuthn security keys / passkeys as 2FA (via `@simplewebauthn`)
- Add optional birthday field with a toast 24h before
- Allow "appear offline" option
- Nicknames (JSON, local only)
- Remove hardcoded `SharkordUser`, use identity by default
- Fix auth logout endpoint; properly unmount on log-out

## Security

- Security fixes:
  - Use real UUIDs + JWT for `/public/` path files (except server login image)
  - Dropped `Access-Control-Allow-Origin` entirely: client and API are
    same-origin behind one Caddy host, so no CORS allow-* headers are sent
  - Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
    `Strict-Transport-Security`, `Content-Security-Policy`,
    `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`; force
    HTTP -> HTTPS (301)
  - `script-src` uses per-request CSP nonces; stricter CSP policies overall
  - Removed password hash from `getUserById` / `getUsers` (kept only in
    `getUserByIdentity` for login)
  - `upload.ts` enforces actual byte count; chunked, encrypted when ephemeral
    is on (1:1)
  - `?accessToken=` for private channel files unchanged (per-file HMAC, not the
    session token)
  - `get-file-url.ts` no longer leaks the token in the URL
  - Admins have no access to location or raw IPs (hashed versions only)
  - Tighten user-select queries (data-exposure minimization)
  - Do not leak channel label in mentions to users without access
- Ephemeral chats are E2EE encrypted; properly close / terminate the e2ee worker
- Add missing per-role permissions for DMs
- Fix permissions for text vs voice channels
- Fix various input validation issues
- Client IP for rate limiting / lockout / audit is derived only from trusted
  proxy hops or a configured header (`CAESAR_TRUSTED_PROXY_HOPS`,
  `CAESAR_TRUSTED_CLIENT_IP_HEADER`); spoofable forwarding headers are ignored
- Various rate limiting additions:
  - Per-IP burst limiter on `/login`
  - Rate-limit the `/public` file endpoint
  - Failed-login lockout: escalating per-IP lock after repeated failures (#371)

## Permissions & moderation (ACL)

- Add `CAESAR_MAX_USERS=N`
- Move members with drag and drop across categories / channels
- Allow dragging users into a different channel
- Owner role is not editable: removed from ACL controls
- Add red banner for permission warnings
- Various ACL fixes

## UX / UI

- Save / Cancel buttons at the top of settings pages
- Remove auto-join last channel; add new Notifications options
- Keyboard- (no-mouse-) friendly
- Category drag with overlay and preview
- Split server actions with categories
- Settings page can disconnect from call
- Do not suggest DM channels in the channel-mention picker
- Cleanup after leaving a channel / using settings page
- Remove per-voice-channel chat (redundant)
- Lazy-load most things / chunk
- Fix cache ETag on images (stops re-downloading same assets)
- Mobile layout fixes
- Social credit (reward 1 per 15 min active, capped at 50/day)
- Online-count pill in server view
- Fix thread reply count not updating live
- Fix stale admin / server-settings toggles
- Other layout / UX polish

## Build, deps & repo

- Full switch from `bun` to `pnpm`
- Switch prod image to distroless
- Wire up ARM builds (multi-arch)
- Target Linux only
- Update all deps; pin major for TS / Node / mediasoup
- Remove logging deps and git integration
- `prod-dev` compose profile for fresh HTTPS testing on `:8443`
- Change `Dockerfile`, renovate config, embed helper to not leave stale artifacts
- Add `PRAGMA` modes to SQLite
- Fix seed (original spawning for server)
- Remove plugin system (dev)
- Changed 570 `../../..` import sites to `@` patterns
- Move 73 imports from server to shared
- Removed the `shared/trpc.ts` re-export and the `ws.WebSocket` module augmentation
- Various refactors to reduce duplicate offenders in non-granular call-sites
- Various changes to manifest, version strings, GitHub URL
- Heap profiling
- Documentation work
- Port more upstream changes
