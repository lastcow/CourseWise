import type { Db } from './db/client';
import type { AuthContext } from './middleware/types';

export interface AppBindings {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  CORS_ORIGIN: string;
  BCRYPT_ROUNDS?: string;
  GIT_SHA?: string;
  BUILT_AT?: string;
  ENVIRONMENT?: string;
  RATE_LIMIT_KV?: KVNamespace;
  // R2 / S3-compatible storage. The bucket can also be bound directly as
  // `COURSE_FILES` (used for HEAD checks and deletes); presigning needs the
  // S3 credentials below.
  COURSE_FILES?: R2Bucket;
  R2_BUCKET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_PUBLIC_ENDPOINT?: string;
  // Cloudflare AI Gateway. Required once Phase 2 generators ship; Phase 1 only
  // surfaces a "configured?" status in the admin UI.
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  // Provider API keys. These are bound by name; the DB stores the binding name
  // in ai_providers.api_key_secret_ref so admins can rotate without redeploying.
  // Additional provider keys can be added the same way without touching this type
  // — the gateway helper looks them up dynamically.
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

export interface AppVariables {
  db: Db;
  auth: AuthContext;
  validated: unknown;
}

export interface AppEnv {
  Bindings: AppBindings;
  Variables: AppVariables;
}
