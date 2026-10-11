// Whether a WS close may keep the persisted auto-login token.
//
// App-range codes (4000-4999: kicked, banned, superseded, logged out) are
// deliberate server decisions and always end the session. Anything else
// (1001 going away, 1005/1006 dropped, e.g. Android freezing a backgrounded
// PWA) is transport loss, but only counts as such if the socket had joined:
// a bad/expired token makes tRPC close before join with a non-app code, and
// keeping the token there would loop auto-login forever.
const isTransientClose = (code: number, wasJoined: boolean) =>
    wasJoined && (code < 4000 || code > 4999);

export { isTransientClose };
