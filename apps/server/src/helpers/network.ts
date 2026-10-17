import ipaddr from 'ipaddr.js';
import os from 'os';

const getPrivateIp = async () => {
  const interfaces = os.networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((iface) => iface?.family === 'IPv4' && !iface.internal)
    .map((iface) => iface?.address);

  return addresses[0];
};

const getPublicIpFromIpify = async (): Promise<string | undefined> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = (await response.json()) as {
      ip: string;
    };

    return data.ip;
  } catch {
    return undefined;
  }
};

// fallback since it can return ipv6 sometimes
const getPublicIpFromIfconfig = async (): Promise<string | undefined> => {
  try {
    const response = await fetch('https://ifconfig.me/ip');
    const ip = (await response.text()).trim();

    return ip;
  } catch {
    return undefined;
  }
};

const getPublicIpFromIcanhazip = async (): Promise<string | undefined> => {
  try {
    const response = await fetch('https://ipv4.icanhazip.com');
    const ip = (await response.text()).trim();

    return ip;
  } catch {
    return undefined;
  }
};

const getPublicIp = async () => {
  let ip = await getPublicIpFromIcanhazip();

  if (!ip) {
    ip = await getPublicIpFromIpify();
  }

  if (!ip) {
    ip = await getPublicIpFromIfconfig();
  }

  return ip;
};

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
