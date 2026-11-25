/**
 * Validation for BETTER_AUTH_SECRET, which signs session cookies. A guessable secret lets
 * anyone forge sessions, so production refuses to start without a strong one.
 *
 * Messages describe *why* a value was rejected and never include the value itself.
 */

/** The placeholder shipped in .env.example (kept in sync by tests/unit/auth-secret.test.ts). */
export const EXAMPLE_AUTH_SECRET = 'local-development-secret-change-me-0000000000'

export const MIN_SECRET_LENGTH = 32
/** Estimated entropy floor; `openssl rand -base64 32` yields ~200+ bits by this estimate. */
export const MIN_SECRET_BITS = 128

const PLACEHOLDER_PATTERN = /change[-_ ]?me|example|placeholder|default|your[-_ ]?secret|replace[-_ ]?me|development|dev[-_ ]?secret|test[-_ ]?secret|^secret$|password/i

export type AuthSecretProblem = 'missing' | 'too_short' | 'placeholder' | 'low_entropy'

const DESCRIPTIONS: Record<AuthSecretProblem, string> = {
  missing: 'BETTER_AUTH_SECRET is not set.',
  too_short: `BETTER_AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters.`,
  placeholder: 'BETTER_AUTH_SECRET is an example or placeholder value.',
  low_entropy: 'BETTER_AUTH_SECRET is too predictable (repetitive or low variety).',
}

const HOW_TO_FIX = 'Generate one with `openssl rand -base64 32` and set it in the environment.'

/** Shannon estimate of the total bits in the string, based on its own character frequencies. */
export function estimateEntropyBits(value: string): number {
  if (!value) return 0
  const counts = new Map<string, number>()
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  const length = [...value].length
  let bitsPerChar = 0
  for (const count of counts.values()) {
    const p = count / length
    bitsPerChar -= p * Math.log2(p)
  }
  return bitsPerChar * length
}

/** Returns the first problem with the secret, or null when it is acceptable for production. */
export function findAuthSecretProblem(value: string | undefined): AuthSecretProblem | null {
  const secret = value?.trim() ?? ''
  if (!secret) return 'missing'
  if (secret === EXAMPLE_AUTH_SECRET || PLACEHOLDER_PATTERN.test(secret)) return 'placeholder'
  if (secret.length < MIN_SECRET_LENGTH) return 'too_short'
  if (new Set(secret).size < 8 || estimateEntropyBits(secret) < MIN_SECRET_BITS) return 'low_entropy'
  return null
}

export class InsecureAuthSecretError extends Error {
  constructor(readonly problem: AuthSecretProblem) {
    super(`${DESCRIPTIONS[problem]} ${HOW_TO_FIX}`)
    this.name = 'InsecureAuthSecretError'
  }
}

/**
 * Production: any problem is fatal.
 * Development and tests: a missing or short secret is still fatal (Better Auth needs one),
 * while a placeholder is allowed with a warning so local setup keeps working.
 */
export function assertAuthSecret(value: string | undefined, options: { production: boolean, warn?: (message: string) => void }): void {
  const problem = findAuthSecretProblem(value)
  if (!problem) return
  if (options.production || problem === 'missing' || problem === 'too_short') throw new InsecureAuthSecretError(problem)
  options.warn?.(`[auth] ${DESCRIPTIONS[problem]} Acceptable for local development only.`)
}
