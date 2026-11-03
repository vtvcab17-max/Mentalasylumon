import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

/** LectureHall — khung rỗng ở Setup; logic được thêm theo tasks.md. */
export class LectureHall extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  }
}
