import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyGoogleIdToken } from "../src/auth/google-id-token";
import { chatKey } from "../src/do/key-vault";

const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function setup() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = { ...((await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey), kid: "k1" };
  const sign = async (claims: Record<string, unknown>, kid = "k1") => {
    const head = enc({ alg: "RS256", kid, typ: "JWT" });
    const body = enc(claims);
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
    return `${head}.${body}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  };
  return { jwks: async () => ({ keys: [jwk] }), sign };
}

const good = { iss: "https://accounts.google.com", aud: "client-1", sub: "123", email: "a@b.c", email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 };

describe("Google ID token (đăng nhập không cần secret)", () => {
  it("token đúng chữ ký và đúng Client ID → nhận", async () => {
    const { jwks, sign } = await setup();
    const claims = await verifyGoogleIdToken(await sign(good), "client-1", { jwks });
    expect(claims.sub).toBe("123");
  });

  it.each([
    ["sai Client ID", { ...good, aud: "client-khac" }],
    ["hết hạn", { ...good, exp: Math.floor(Date.now() / 1000) - 3600 }],
    ["sai nơi phát hành", { ...good, iss: "https://evil.example" }],
    ["email chưa xác minh", { ...good, email_verified: false }],
  ])("từ chối: %s", async (_name, claims) => {
    const { jwks, sign } = await setup();
    await expect(verifyGoogleIdToken(await sign(claims), "client-1", { jwks })).rejects.toThrow();
  });

  it("từ chối token bị sửa nội dung", async () => {
    const { jwks, sign } = await setup();
    const [h, , s] = (await sign(good)).split(".");
    await expect(verifyGoogleIdToken(`${h}.${enc({ ...good, sub: "hacker" })}.${s}`, "client-1", { jwks })).rejects.toThrow(/signature/);
  });
});

describe("KeyVault (khóa mã hóa tự tạo)", () => {
  it("không đặt secret → tự tạo khóa 32 byte, lần sau vẫn đúng khóa đó", async () => {
    const a = await chatKey({ KEY_VAULT: env.KEY_VAULT });
    const b = await chatKey({ KEY_VAULT: env.KEY_VAULT });
    expect(a).toBe(b);
    expect(atob(a).length).toBe(32);
  });
});
