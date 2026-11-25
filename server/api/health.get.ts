/** Liveness + database connectivity check. */
export default defineEventHandler(async (event) => {
  let database: 'ok' | 'unavailable' = 'ok'
  try {
    await usePrisma().$queryRaw`SELECT 1`
  }
  catch {
    database = 'unavailable'
  }
  if (database !== 'ok') setResponseStatus(event, 503)
  return { status: database === 'ok' ? 'ok' : 'degraded', database }
})
