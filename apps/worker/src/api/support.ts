import type { Hono } from "hono";
import { loadResourceRows, toPublic } from "../safety/resources";
import type { AppEnv } from "../types";
import { requestLocale } from "./errors";

/** GET /api/support-resources?lang= — công khai, cache 5 phút (T035, FR-021, FR-039). */
export function registerSupport(app: Hono<AppEnv>) {
  app.get("/api/support-resources", async (c) => {
    const locale = requestLocale(c);
    const resources = toPublic(await loadResourceRows(c.env.DB), locale, new Date());
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ locale, resources });
  });
}
