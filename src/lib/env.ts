import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_DATABASE_URL: z.string().min(1, 'AUTH_DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: z.string().url('AUTH_URL must be a valid URL').optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  EMAIL_SERVER_HOST: z.string().min(1, 'EMAIL_SERVER_HOST is required'),
  EMAIL_SERVER_PORT: z.string().regex(/^\d+$/, 'EMAIL_SERVER_PORT must be a number'),
  EMAIL_SERVER_USER: z.string().min(1, 'EMAIL_SERVER_USER is required'),
  EMAIL_SERVER_PASSWORD: z.string().min(1, 'EMAIL_SERVER_PASSWORD is required'),
  EMAIL_FROM: z.string().min(1, 'EMAIL_FROM is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
})

let validated = false

export function validateEnv() {
  if (validated) return
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const errors = result.error.issues.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n')
    console.error(`[env] Environment validation failed:\n${errors}`)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Environment validation failed. Check server logs for details.`)
    }
  }
  validated = true
}
