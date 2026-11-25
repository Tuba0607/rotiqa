import type { H3Event } from 'h3'
import { z, ZodError } from 'zod'
import { AppError } from '../modules/errors'
import { runInOrganization, type OrgContext } from '../modules/tenancy/access'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Same-origin check for state-changing requests (defense in depth next to SameSite=Lax
 * session cookies). Requests without an Origin header (server-to-server, tests) pass.
 */
function assertSameOrigin(event: H3Event): void {
  if (!MUTATING.has(event.method)) return
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return
  const host = getRequestHeader(event, 'x-forwarded-host') ?? getRequestHeader(event, 'host')
  if (!host || new URL(origin).host !== host) throw new AppError('FORBIDDEN', 'İstek reddedildi.')
}

function toHttpError(error: unknown) {
  if (error instanceof AppError) {
    return createError({ statusCode: error.status, statusMessage: error.code, message: error.message, data: { code: error.code, message: error.message, fields: error.fields } })
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) fields[issue.path.join('.') || '_'] ??= issue.message
    const message = Object.values(fields)[0] ?? 'Lütfen bilgileri kontrol edin.'
    return createError({ statusCode: 422, statusMessage: 'VALIDATION', message, data: { code: 'VALIDATION', message, fields } })
  }
  // Never leak database or stack details to clients.
  console.error('[api] unexpected error', error)
  const message = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'
  return createError({ statusCode: 500, statusMessage: 'INTERNAL', message, data: { code: 'INTERNAL', message } })
}

export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event) => {
    try {
      assertSameOrigin(event)
      return await handler(event)
    }
    catch (error) {
      throw toHttpError(error)
    }
  })
}

export interface OrgRequest {
  body: unknown
  query: Record<string, unknown>
  event: H3Event
}

/**
 * Authenticated handler scoped to /api/orgs/[slug]/…: resolves the session, reads input
 * before opening the transaction, then runs `handler` inside the tenant context.
 */
export function defineOrgHandler<T>(handler: (ctx: OrgContext, request: OrgRequest) => Promise<T>) {
  return defineApiHandler(async (event) => {
    const user = await requireUser(event)
    const slug = getRouterParam(event, 'slug') ?? ''
    const body = MUTATING.has(event.method) ? await readBody(event).catch(() => undefined) : undefined
    const query = getQuery(event)
    return runInOrganization(usePrisma(), user.id, slug, ctx => handler(ctx, { body, query, event }))
  })
}

const uuid = z.uuid()

/** Route id parameter; malformed ids are a 404, never a database error. */
export function uuidParam(event: H3Event, name = 'id'): string {
  const parsed = uuid.safeParse(getRouterParam(event, name))
  if (!parsed.success) throw new AppError('NOT_FOUND')
  return parsed.data
}
