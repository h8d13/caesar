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

export { getIpBlockKey, getPrivateIp };
