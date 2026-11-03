import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ALL_CONSENT, AVATAR, call, login, seedDoctors, seedResources } from "./helpers";

beforeAll(async () => {
  await seedResources();
  await seedDoctors();
});

describe("onboarding (T042, FR-002–FR-004)", () => {
  it("khai dưới 18 tuổi → UNDERAGE kèm nguồn hỗ trợ cho người trẻ", async () => {
    const { cookie } = await login();
    const res = await call(cookie, "POST", "/api/onboarding/age", { isAdult: false });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; resources: { id: string }[] } };
    expect(body.error.code).toBe("UNDERAGE");
    expect(body.error.resources.map((r) => r.id)).toContain("child-111");
  });

  it("thiếu một mục đồng ý bắt buộc → VALIDATION", async () => {
    const { cookie } = await login();
    await call(cookie, "POST", "/api/onboarding/age", { isAdult: true });
    const res = await call(cookie, "POST", "/api/onboarding/consent", {
      termsVersion: "2026-11-v1",
      items: { ...ALL_CONSENT, admin_flag_review: false },
    });
    expect(res.status).toBe(400);
  });

  it("đi hết các bước → có phòng; /api/me không lộ email", async () => {
    const { cookie } = await login();
    expect((await call(cookie, "POST", "/api/onboarding/age", { isAdult: true })).status).toBe(204);
    expect((await call(cookie, "POST", "/api/onboarding/consent", { termsVersion: "2026-11-v1", items: ALL_CONSENT })).status).toBe(204);
    const prof = await call(cookie, "POST", "/api/onboarding/profile", { nickname: "Mây Xanh", avatar: AVATAR });
    expect(prof.status).toBe(200);
    expect(await prof.json()).toMatchObject({ roomNumber: expect.any(Number), wing: expect.any(String) });

    const me = (await (await call(cookie, "GET", "/api/me")).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ nickname: "Mây Xanh", onboarding: { age: true, consent: true, profile: true } });
    expect(JSON.stringify(me)).not.toContain("@example.com");
  });

  it("biệt danh trùng (không phân biệt hoa thường) bị từ chối", async () => {
    const a = await login();
    const b = await login();
    for (const u of [a, b]) {
      await call(u.cookie, "POST", "/api/onboarding/age", { isAdult: true });
      await call(u.cookie, "POST", "/api/onboarding/consent", { termsVersion: "2026-11-v1", items: ALL_CONSENT });
    }
    expect((await call(a.cookie, "POST", "/api/onboarding/profile", { nickname: "Trăng", avatar: AVATAR })).status).toBe(200);
    const dup = await call(b.cookie, "POST", "/api/onboarding/profile", { nickname: "TRĂNG", avatar: AVATAR });
    expect(dup.status).toBe(409);
  });

  it("đổi phiên bản điều khoản → phải đồng ý lại", async () => {
    const { cookie } = await login({ onboarded: true });
    expect((await call(cookie, "GET", "/api/doctors")).status).toBe(200);
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('terms_version', '2026-12-v2')").run();
    const res = await call(cookie, "GET", "/api/doctors");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "CONSENT_REQUIRED", termsVersion: "2026-12-v2" } });
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('terms_version', '2026-11-v1')").run();
  });

  it("đổi ngôn ngữ", async () => {
    const { cookie } = await login();
    expect((await call(cookie, "PUT", "/api/me/locale", { locale: "en" })).status).toBe(204);
    const me = (await (await call(cookie, "GET", "/api/me")).json()) as { locale: string };
    expect(me.locale).toBe("en");
  });
});
