import ipaddr from 'ipaddr.js';
import https from 'https';
import os from 'os';

const getPrivateIp = async () => {
  const interfaces = os.networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
    .map((iface) => iface?.address);

  return addresses[0];
};

// Only used when CAESAR_WEBRTC_ANNOUNCED_ADDRESS is unset. Equivalent of
// `curl -4 ifconfig.me`: family 4 so a dual-stack host never gets its IPv6.
const getPublicIp = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    const req = https.get(
      'https://ifconfig.me/ip',
      { family: 4, timeout: 5000 },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const ip = body.trim();
          resolve(ipaddr.IPv4.isValid(ip) ? ip : undefined);
        });
      }
    );

    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(undefined));
  });

// Key for IP-based blocks (login lockout). IPv4 is used as is; IPv6 is grouped
// by /64 since a single client usually controls a whole /64 and could
// otherwise rotate addresses to dodge the block.
const getIpBlockKey = (ip: string): string => {
  if (!ipaddr.isValid(ip)) return ip;

  const address = ipaddr.process(ip);

  if (address.kind() === 'ipv4') return address.toString();

  const network = ipaddr.IPv6.networkAddressFromCIDR(
    `${address.toString()}/64`
  );

  return `${network.toString()}/64`;
};

export { getIpBlockKey, getPrivateIp, getPublicIp };
