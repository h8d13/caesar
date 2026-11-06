# guidelines

## Environment

- Everything runs in containers; no touching the host.
  - dev tooling: `podman-compose -f compose.dev.yaml run --rm --no-deps -T
    caesar sh -c '<cmd>'` (repo bind-mounted, node_modules in volumes)
  - prod-like stack: `compose.prod-dev.yaml` (Dockerfile.prod + Caddy on
    `https://localhost:8443`). Needs BuildKit (`RUN --mount`), so `podman`
    or `docker` with buildx. `podman-compose` keeps running containers on a
    rebuilt image: `up -d --force-recreate` after `build`.
- Checks before calling anything done: `pnpm check-types`, `pnpm lint`,
  `pnpm format:check`, `pnpm test` (all packages, like CI), `pnpm knip`.
- Do not run `pnpm format` while another session edits the tree: it
  rewrites files that are not yours.
- A fresh prod-dev instance has no users. The first sign-in (Sign in tab,
  any identity) bootstraps the account; owner rights need the token
  printed in the server log (`useToken("...")` in the browser console).

## Structure

pnpm workspace (`apps/*`, `packages/*`):

- `apps/client`: Vite + React 19 SPA, alias `@/` -> `src/`.
  - `screens/`: top-level states (connect, loading, server view,
    disconnected)
  - `components/`: UI grouped by feature (channel view, sidebar, settings
    under `server-screens/`, dialogs)
  - `features/`: Redux Toolkit store; per domain `slice`, `selectors`
    (reselect / re-reselect for parametrized ones), `hooks`, `actions`
  - `hooks/`, `helpers/`, `lib/` (tRPC client, e2ee, utils)
- `apps/server`: Node, tRPC routers (`routers/`), raw HTTP endpoints
  (`http/`), Drizzle + libsql (`db/`, migrations), mediasoup voice
  (`runtimes/`), queues, crons. Alias `@server/`. Ships as a single
  executable (`build:sea`).
- `packages/shared`: types, enums, permissions, constants, test ids and
  the Drizzle schema, used by both sides. No React, no Node-only APIs
  (the client bundles it).
- `packages/ui` (`@caesar/ui`): shadcn/Radix primitives; compiled
  through the client build.
- Lint and format config live only in the root `vite.config.ts`
  (per-package differences are `overrides`): client indents 4 spaces,
  everything else 2.

## Dependencies

- Add or bump inside the dev container:
  `pnpm --filter <package> add <dep>`; review the lockfile diff.
- `pnpm-workspace.yaml` is the dependency policy:
  - `catalog` + `catalogMode: strict`: a dep used by more than one
    package, or that must move in lockstep with another, lives in the
    catalog and is referenced as `catalog:`. The reason for a pin or
    lockstep lives next to the entry or in its `renovate.json` rule.
  - 0.x families sharing an internal package (e.g. `@dnd-kit/*` on one
    `@dnd-kit/abstract`) are pinned exactly and grouped in
    `renovate.json` so they bump together.
  - `minimumReleaseAge`: versions younger than 24h fail to install
    (supply-chain guard); renovate waits 3 days.
  - `allowBuilds`: only whitelisted packages may run install scripts;
    a new native dep fails install until added there deliberately.
  - `overrides` force single copies (`@libsql/client`), and `vite` is
    aliased to vite-plus-core.
  - `injectWorkspacePackages`: workspace packages are copied, not
    symlinked (needed by `pnpm deploy` for the server image).
    `Dockerfile.prod` copies `packages/*` in full before install for
    this reason.
  - `engineStrict`: node below `engines` fails install.
- Prefer what is already in the tree (platform APIs, existing deps)
  before adding a package.

## React Compiler

- The client builds with the native React Compiler
  (`react({ compiler })` in `apps/client/vite.config.ts`). It compiles
  `apps/client` and `packages/ui` (workspace imports resolve to source).
  The server and `packages/shared` stay React-free.
- Skipped components run uncompiled, silently. `vp dev` logs them
  (diagnostics are dev-only). Known causes in this codebase:
  - `try`/`finally`: write `try`/`catch` then the reset after it (same
    behavior when the catch does not rethrow)
  - logical assignment (`??=`, `||=`, `&&=`)
  - `eslint-disable` of React rules in the component
- Manual `useMemo`/`useCallback`/`memo` stay useful where the compiler
  skips a file, and at boundaries with libraries that compare identity.

## Re-render rules

Keep new code clear of them.

- Selectors must not return fresh arrays/objects for unchanged data.
  A `.filter()`/`.map()` result (or `[]`) is a new reference every time
  the inputs change; compare with `shallowEqual` in the hook or return
  a shared constant. Prefer selecting a primitive per row
  (`isLatest === id`) over a value every row reads.
- Never pass a fresh `[]`/`{}` fallback as a prop (`x ?? []`); use a
  module-level empty constant.
- Library options objects (dnd sensors, collision functions, configs)
  belong at module level: libraries memoize on their identity, and a new
  one rebuilds listeners for every consumer.
- Handlers that read current form values but feed memoized children
  (save buttons, footers, dialog confirm, drag handlers) use
  `useLatestCallback` (`apps/client/src/hooks/use-latest-callback.ts`):
  stable identity, always calls the latest function. Only call it from
  events, never during render.
- Per-row callbacks take the row key instead of closing over it
  (`onToggle(permission)`), so one change re-renders one row.
- Keep form state below dialog chrome: dialog shells are frame-only, the
  body component owns the state and renders the footer. State above a
  modal re-renders every portal/presence/focus layer per keystroke.
- Editors and large inputs are uncontrolled: the editor owns its
  content, the parent reads it through a handle at submit time.
- `useForm` handlers are built once per key; field primitives
  (`Input`, `Textarea`, `Color`, `Button`) are memoized so untouched
  fields bail.
- Library internals (Radix scopes, `useSize`, dnd internals) re-render
  on their own (often for a good reason); fix our side first, do not
  patch around them in app code.

## Measuring re-renders

Measure before and after every fix; reading code alone missed most of
the causes above.

- Build: `CAESAR_PROFILE=1 podman-compose -f compose.prod-dev.yaml build`
  then recreate. `CAESAR_PROFILE` emits client sourcemaps and aliases
  `react-dom/client` to `react-dom/profiling` (fiber timings, DevTools
  Profiler). Never ship that build.
- Scanner: `scripts/rerender/hook.js`, pasted into the page console with
  React DevTools installed (it wraps the DevTools commit hook).
  - `__rr.mark(label)` starts a scenario, `__rr.totals()` gives
    `redundant/renders redundantMs/ms` per scenario, `await
    __rr.report()` lists cut roots with sourcemapped `file:line`,
    causes and the parent that triggered them.
  - A render is redundant when no prop, state hook or context value
    really changed (new reference with equal content, new function, or
    plain parent cascade). Wasted renders are credited to the topmost
    redundant component: that is where the fix goes.
- Read the numbers with their limits:
  - counts are not cost; use the ms columns (profiling build) to rank
  - a new function reference counts as redundant even when its
    behavior changed; the render is still avoidable via a stable handler
  - nested changes deeper than 6 levels, Maps/Sets and state-design waste
    (a parent holding state it should not) are invisible to it
  - drive scenarios by element (label, role), not screen coordinates:
    layout shifts make coordinate runs incomparable
  - synthetic one-step drags can be cancelled by drag libraries that
    start asynchronously; use stepped pointer moves or a real mouse
- Cross-check with the React DevTools Profiler ("why did this render")
  on the same scenario when a result looks surprising.
- After structural changes, smoke-test the touched flows by hand
  (submit, cancel, keyboard paths); render counts say nothing about
  behavior.

The same idea applies to fetches, queries over-fetching thar aren't scoped
correctly.
