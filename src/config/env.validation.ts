import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  MCP_TRANSPORT_TYPE: z.enum(['dual', 'stdio', 'sse']).default('dual'),

  // HoneyQuote QA API
  MCP_API_BASE_URL: z.string().default('https://mcp-server-qa.cda7df0f963e4a14a920.eastus.aksapp.io/api/v1'),
  MCP_API_CLIENT_ID: z.string().default('Xa97kHBu5HMFIGd4WfpzAZgP3Us8J35sARdo1ycPmjQ'),

  // MongoDB Atlas
  MONGODB_URI: z.string().optional(),
  MONGODB_DB_NAME: z.string().default('hq_demo'),
  SEED_ON_STARTUP: z.coerce.boolean().default(false),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  DEFAULT_CUSTOMER_PHONE: z.string().default('+919503760623'),
  // Gmail API
  GMAIL_ENABLED: z.coerce.boolean().default(false),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_FROM: z.string().optional(),
  DEMO_CUSTOMER_EMAIL: z.string().default('hemantj@wekancode.com'),

  // Slack HITL
  SLACK_ENABLED: z.coerce.boolean().default(false),
  SLACK_WEBHOOK_URL: z.string().optional(),

  // Next.js Widgets
  WIDGETS_DEV_MODE: z.coerce.boolean().default(false),
  WIDGETS_DEV_PORT: z.coerce.number().default(3001),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.warn('[config] Environment validation warnings:', result.error.format());
    return envSchema.parse({});
  }
  return result.data;
}
