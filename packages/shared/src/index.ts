import { z } from "zod";

export const Locale = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof Locale>;

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }).passthrough(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export * from "./protocol";
export * from "./api";
