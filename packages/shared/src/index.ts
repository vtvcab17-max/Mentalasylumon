import { z } from "zod";

/** Schema dùng chung cho client và worker. Bổ sung đầy đủ ở T021 theo contracts/. */
export const Locale = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof Locale>;

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
