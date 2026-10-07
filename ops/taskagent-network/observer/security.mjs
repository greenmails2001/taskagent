import net from "node:net";

const blockedIpv4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
];

function ipv4Number(address) {
  return address.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inCidr(address, cidr) {
  const [base, bitsText] = cidr.split("/");
  if (net.isIP(address) !== 4 || net.isIP(base) !== 4) return false;
  const bits = Number(bitsText);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function isBlocked(address) {
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
  }
  return blockedIpv4.some(([base, bits]) => inCidr(address, `${base}/${bits}`));
}

export function normalizeTarget(inventory, targetId) {
  const target = inventory.targets?.[targetId];
  if (!target) throw new Error(`unknown target_id: ${targetId}`);
  const url = new URL(target.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("target scheme is not allowed");
  if (url.username || url.password) throw new Error("target credentials are forbidden");
  return url;
}

export function validateResolvedAddresses(addresses, allowedCidrs) {
  if (!addresses.length) throw new Error("target did not resolve");
  for (const address of addresses) {
    if (isBlocked(address)) throw new Error(`blocked address: ${address}`);
    if (!allowedCidrs.some((cidr) => inCidr(address, cidr))) {
      throw new Error(`address outside allowed CIDRs: ${address}`);
    }
  }
}

export function validateServiceQuery(inventory, service, lines) {
  if (!inventory.services?.includes(service)) throw new Error(`unknown service_id: ${service}`);
  if (!Number.isInteger(lines) || lines < 1 || lines > 200) throw new Error("lines must be between 1 and 200");
  return { service, lines };
}
