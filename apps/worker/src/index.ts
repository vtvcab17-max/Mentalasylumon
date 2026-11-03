import { Hono } from "hono";
import { apiError } from "./api/errors";
import { requireOnboarded, requireUser } from "./api/guards";
import { registerSupport } from "./api/support";
import { registerMe } from "./api/me";
import { registerOnboarding } from "./api/onboarding";
import { registerConversations } from "./api/conversations";
import { registerAccount } from "./api/account";
import { registerAdminFlags } from "./admin/flags";
import { registerGoogleAuth } from "./auth/google";
import { loadUser, requireCsrfHeader } from "./auth/session";
import type { Env } from "./env";
import type { AppEnv } from "./types";

export { WorldZone } from "./do/world-zone";
export { CircleRoom } from "./do/circle-room";
export { LectureHall } from "./do/lecture-hall";
export { PatientRecord } from "./do/patient-record";
export { KeyVault } from "./do/key-vault";

/** Router (T020). Các nhóm route của từng user story được đăng ký ở Phase 3+. */
const app = new Hono<AppEnv>();

app.use("/api/*", requireCsrfHeader, loadUser);
app.use("/admin/api/*", requireCsrfHeader, loadUser);
app.use("/auth/*", loadUser);
app.use("/ws/*", loadUser);

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.APP_ENV }));
registerSupport(app);
registerGoogleAuth(app);
registerMe(app);
registerOnboarding(app);
registerConversations(app);
registerAccount(app);
registerAdminFlags(app);

// WebSocket → Durable Object. Người chơi phải đăng nhập và đã qua onboarding.
const WS_ROUTES: Record<string, keyof Pick<Env, "WORLD_ZONE" | "CIRCLE_ROOM" | "LECTURE_HALL">> = {
  zone: "WORLD_ZONE",
  circle: "CIRCLE_ROOM",
  lecture: "LECTURE_HALL",
};

app.get("/ws/:kind/:id{.+}", requireUser, requireOnboarded, async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return apiError(c, "VALIDATION", 426);
  const binding = WS_ROUTES[c.req.param("kind")];
  if (!binding) return apiError(c, "NOT_FOUND", 404);
  const ns = c.env[binding];
  const stub = ns.get(ns.idFromName(c.req.param("id")));
  const user = c.get("user")!;
  // Danh tính đi qua header nội bộ; DO không bao giờ tin header từ client vì request chỉ tới từ Worker.
  const req = new Request(c.req.raw);
  req.headers.set("X-User-Id", user.id);
  req.headers.set("X-User-Locale", user.locale);
  return stub.fetch(req);
});

app.all("/api/*", (c) => apiError(c, "NOT_FOUND", 404));
app.all("/admin/api/*", (c) => apiError(c, "NOT_FOUND", 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // T100: dọn phiên hết hạn, cờ quá hạn, tài khoản đã xóa.
  },
} satisfies ExportedHandler<Env>;
