export interface Env {
  APP_ENV: "dev" | "staging" | "production";
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;

  DB: D1Database;
  ASSETS: Fetcher;
  ASSETS_BUCKET?: R2Bucket; // tạm tắt cho tới khi bật R2

  WORLD_ZONE: DurableObjectNamespace;
  CIRCLE_ROOM: DurableObjectNamespace;
  LECTURE_HALL: DurableObjectNamespace;
  PATIENT_RECORD: DurableObjectNamespace;

  // Secrets
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  CHAT_ENCRYPTION_KEY: string;
}
