import { randomBytes } from "node:crypto";

/**
 * UUIDv7 (RFC 9562): 48-bit unix-ms timestamp + random. Time-ordered so
 * b-tree indexes append instead of fragmenting. All app-generated IDs
 * (every table except WorkOS-owned ids) come from here.
 */
export function uuidv7(): string {
  const b = randomBytes(16);
  const ts = Date.now();
  // 48-bit timestamp, big-endian — no BigInt (web app targets < ES2020).
  const hi = Math.floor(ts / 0x1_0000_0000); // top 16 bits
  const lo = ts % 0x1_0000_0000; // bottom 32 bits
  b[0] = (hi >>> 8) & 0xff;
  b[1] = hi & 0xff;
  b[2] = (lo >>> 24) & 0xff;
  b[3] = (lo >>> 16) & 0xff;
  b[4] = (lo >>> 8) & 0xff;
  b[5] = lo & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
