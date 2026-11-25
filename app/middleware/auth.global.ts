/**
 * Client-side navigation guard. It only improves UX: every API route checks the session
 * and permissions on the server independently.
 */
const GUEST_ONLY = new Set(['/giris', '/kayit'])
const PUBLIC = new Set(['/', '/design-system'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return // authenticated areas render client-side (see routeRules)
  if (PUBLIC.has(to.path) || to.path.startsWith('/davet/')) return

  const { data: session } = await authClient.getSession()
  if (GUEST_ONLY.has(to.path)) {
    if (session) return navigateTo(typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/app')
    return
  }
  if (!session) return navigateTo({ path: '/giris', query: { redirect: to.fullPath } })
})
