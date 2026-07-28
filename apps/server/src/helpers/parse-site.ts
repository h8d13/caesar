// CAESAR_SITE does double duty: caddy/Caddyfile uses it as the site address
// (cert name + Host matcher + listen port) while the server derives the
// WebAuthn RP ID and expected origin from it. Caddy accepts several addresses
// in one site block ("a.com, www.a.com"), so a multi-host value loads fine on
// the proxy and then silently poisons the RP ID here: passkeys / hardware 2FA
// stop verifying while password login keeps working. Reject it at boot and
// serve aliases with their own redir block instead.

type TSite = {
  host: string; // WebAuthn RP ID: hostname only, port stripped
  scheme: 'http' | 'https';
  origin: string; // scheme + full CAESAR_SITE, port included
};

const parseSite = (caesarSite: string | undefined): TSite => {
  const site = (caesarSite ?? '').trim() || 'localhost';

  if (/[\s,]/.test(site)) {
    throw new Error(
      `CAESAR_SITE must be a single host, got "${site}". Point it at the ` +
        'canonical host and redirect the aliases with their own site block ' +
        'in caddy/Caddyfile.'
    );
  }

  const host = site.split(':')[0] ?? 'localhost';
  // :8443 is the prod-dev surface (Caddy `tls internal`); plain localhost is
  // the vite dev server. Everything else assumes HTTPS.
  const scheme =
    host === 'localhost' && !site.includes(':8443') ? 'http' : 'https';

  return { host, scheme, origin: `${scheme}://${site}` };
};

export { parseSite, type TSite };
