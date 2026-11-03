/**
 * AES-256-GCM cho nội dung trò chuyện và excerpt cờ khủng hoảng (research.md §R3, Constitution III).
 * Định dạng đầu ra: base64( iv[12] || ciphertext+tag ).
 */

const keyCache = new Map<string, Promise<CryptoKey>>();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function importKey(keyB64: string): Promise<CryptoKey> {
  let p = keyCache.get(keyB64);
  if (!p) {
    const raw = b64ToBytes(keyB64);
    if (raw.length !== 32) return Promise.reject(new Error("CHAT_ENCRYPTION_KEY must be 32 bytes (base64)"));
    p = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache.set(keyB64, p);
  }
  return p;
}

export async function encrypt(keyB64: string, plaintext: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decrypt(keyB64: string, sealed: string): Promise<string> {
  const key = await importKey(keyB64);
  const data = b64ToBytes(sealed);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
  return new TextDecoder().decode(pt);
}
