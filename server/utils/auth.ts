import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import type { H3Event } from 'h3'
import { AppError } from '../modules/errors'
import { usePrisma } from './db'

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be set (at least 32 characters)')

  return betterAuth({
    appName: 'Rotiqa',
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(usePrisma(), { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    // On in production (Better Auth adds stricter built-in rules for sign-in/sign-up).
    // AUTH_RATE_LIMIT=off exists only for the e2e suite, which signs up many accounts from one IP.
    rateLimit: { enabled: process.env.NODE_ENV === 'production' && process.env.AUTH_RATE_LIMIT !== 'off', window: 60, max: 30 },
    telemetry: { enabled: false },
  })
}

type Auth = ReturnType<typeof createAuth>
const globalForAuth = globalThis as unknown as { __rotiqaAuth?: Auth }

/** Better Auth instance (lazy so builds and unit tests need no secrets or database). */
export function useAuth(): Auth {
  globalForAuth.__rotiqaAuth ??= createAuth()
  return globalForAuth.__rotiqaAuth
}

export interface SessionUser {
  id: string
  name: string
  email: string
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await useAuth().api.getSession({ headers: event.headers })
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null
}

/** Server-side authentication check for every protected API route. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) throw new AppError('UNAUTHENTICATED')
  return user
}
