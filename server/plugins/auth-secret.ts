import { assertAuthSecret } from '../modules/security/auth-secret'

/**
 * Fail fast at server start: a production build never boots with a missing, example or weak
 * BETTER_AUTH_SECRET. (Built servers are always production; `nuxt dev` is not.)
 */
export default defineNitroPlugin(() => {
  assertAuthSecret(process.env.BETTER_AUTH_SECRET, {
    production: !import.meta.dev,
    warn: message => console.warn(message),
  })
})
