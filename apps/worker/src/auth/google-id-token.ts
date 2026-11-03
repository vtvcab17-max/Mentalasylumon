/**
 * Xác minh Google ID token từ nút "Sign in with Google" (Google Identity Services) — chỉ cần Client ID,
 * không cần Client secret. Chữ ký RS256 được kiểm bằng khóa công khai của Google (JWKS).
 */

export interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
}

export type JwksFetcher = () => Promise<{ keys: (JsonWebKey & { kid: string })[] }>;

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

let cache: { at: number; keys: (JsonWebKey & { kid: string })[] } | null = null;

export const fetchGoogleJwks: JwksFetcher = async () => {
  if (cache && Date.now() - cache.at < 3600_000) return { keys: cache.keys };
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  cache = { at: Date.now(), keys: data.keys };
  return data;
};

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const json = (part: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  opts: { jwks?: JwksFetcher; now?: number } = {},
): Promise<GoogleClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const header = json(parts[0]) as { alg: string; kid: string };
  if (header.alg !== "RS256") throw new Error("unexpected alg");

  const { keys } = await (opts.jwks ?? fetchGoogleJwks)();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("bad signature");

  const claims = json(parts[1]) as GoogleClaims;
  const now = (opts.now ?? Date.now()) / 1000;
  if (!ISSUERS.includes(claims.iss)) throw new Error("bad issuer");
  if (claims.aud !== clientId) throw new Error("bad audience");
  if (claims.exp < now - 60) throw new Error("expired");
  if (claims.email_verified !== true || typeof claims.email !== "string") throw new Error("email not verified");
  return claims;
}
