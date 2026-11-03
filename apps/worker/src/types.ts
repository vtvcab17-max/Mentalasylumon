import type { Env } from "./env";

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  locale: "vi" | "en";
  nickname: string | null;
  avatar: string | null;
  age_confirmed_at: string | null;
  role: "player" | "admin";
  status: "active" | "suspended" | "banned" | "deleted";
  suspended_until: string | null;
  room_id: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { user?: UserRow } };

export const nowIso = () => new Date().toISOString();
