// Bloom filter for revocation sets (design §5.5.5).
// Negative is definitive; positive means "possibly revoked".
import { sha256 } from "@noble/hashes/sha2.js";

export function bloomParams(n, p = 0.01) {
  const safeN = Math.max(1, n);
  const bits = Math.ceil((-safeN * Math.log(p)) / Math.LN2 ** 2);
  const hashes = Math.max(1, Math.round((bits / safeN) * Math.LN2));
  return { m: bits, k: hashes };
}

function indexesFor(item, m, k) {
  const digest = sha256(new TextEncoder().encode(item));
  const out = [];
  for (let i = 0; i < k; i += 1) {
    let acc = 0;
    for (let b = 0; b < 4; b += 1) acc = (acc * 256 + digest[(i * 4 + b) % digest.length]) >>> 0;
    out.push(acc % m);
  }
  return out;
}

export function buildBloom(items, capacity = items.length) {
  // Capacity is the revocation window the filter is provisioned for, not the current count.
  const { m, k } = bloomParams(Math.max(capacity, items.length));
  const bits = new Uint8Array(Math.ceil(m / 8));
  for (const item of items) {
    for (const index of indexesFor(item, m, k)) bits[index >> 3] |= 1 << (index & 7);
  }
  return { m, k, bits: Buffer.from(bits).toString("base64") };
}

export function bloomMightContain(bloom, item) {
  const bits = Buffer.from(bloom.bits, "base64");
  return indexesFor(item, bloom.m, bloom.k).every((index) => (bits[index >> 3] & (1 << (index & 7))) !== 0);
}
