// Revocation Bloom filter (design §5.5.5). A negative is definitive; a positive means
// "possibly revoked" and the exact list or an online check decides.
import { b64uDecode, b64uEncode, sha256Bytes } from "./crypto";
import type { BloomFilter } from "./envelope";

export function bloomParams(n: number, p = 0.01): { m: number; k: number } {
  const safeN = Math.max(1, n);
  const bits = Math.ceil((-safeN * Math.log(p)) / Math.LN2 ** 2);
  return { m: bits, k: Math.max(1, Math.round((bits / safeN) * Math.LN2)) };
}

function indexesFor(item: string, m: number, k: number): number[] {
  const digest = sha256Bytes(item);
  const out: number[] = [];
  for (let i = 0; i < k; i += 1) {
    let acc = 0;
    for (let b = 0; b < 4; b += 1) acc = (acc * 256 + digest[(i * 4 + b) % digest.length]) >>> 0;
    out.push(acc % m);
  }
  return out;
}

export function buildBloom(items: string[]): BloomFilter {
  const { m, k } = bloomParams(items.length);
  const bits = new Uint8Array(Math.ceil(m / 8));
  for (const item of items) for (const index of indexesFor(item, m, k)) bits[index >> 3] |= 1 << (index & 7);
  return { m, k, bits: b64uEncode(bits) };
}

export function mightContain(bloom: BloomFilter | undefined, item: string): boolean {
  if (!bloom) return true; // no filter cached: treat as "check online", never as cleared
  const bits = b64uDecode(bloom.bits);
  return indexesFor(item, bloom.m, bloom.k).every((index) => (bits[index >> 3] & (1 << (index & 7))) !== 0);
}
