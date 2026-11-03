import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("health", () => {
  it("trả ok", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("route API chưa có trả lỗi theo định dạng chung", async () => {
    const res = await SELF.fetch("https://example.com/api/khong-co");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
