import { Hono } from "hono";
import type { Env } from "./env";

export { WorldZone } from "./do/world-zone";
export { CircleRoom } from "./do/circle-room";
export { LectureHall } from "./do/lecture-hall";
export { PatientRecord } from "./do/patient-record";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.APP_ENV }));

// Các route còn lại được thêm ở Phase 2+ (xem specs/001-online-mental-hospital/tasks.md).
app.all("/api/*", (c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // T100: dọn phiên hết hạn, cờ quá hạn, tài khoản đã xóa.
  },
} satisfies ExportedHandler<Env>;
