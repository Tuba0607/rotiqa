import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { assertAuthSecret, estimateEntropyBits, EXAMPLE_AUTH_SECRET, findAuthSecretProblem, InsecureAuthSecretError } from '../../server/modules/security/auth-secret'

const strong = () => randomBytes(32).toString('base64')

describe('findAuthSecretProblem', () => {
  it('accepts secrets generated the documented ways', () => {
    for (let i = 0; i < 50; i++) {
      expect(findAuthSecretProblem(strong())).toBeNull()
      expect(findAuthSecretProblem(randomBytes(32).toString('hex'))).toBeNull()
      expect(findAuthSecretProblem(randomBytes(32).toString('base64url'))).toBeNull()
    }
  })

  it.each([
    [undefined, 'missing'],
    ['', 'missing'],
    ['   ', 'missing'],
    [EXAMPLE_AUTH_SECRET, 'placeholder'],
    ['please-change-me-before-going-live-0123456789', 'placeholder'],
    ['your-secret-here-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'placeholder'],
    ['my-development-secret-key-for-rotiqa-app-2026', 'placeholder'],
    ['secret', 'placeholder'],
    ['Zx81Qp0v', 'too_short'],
    ['a'.repeat(64), 'low_entropy'],
    ['abcabcabcabcabcabcabcabcabcabcabcabcabcabcabc', 'low_entropy'],
    ['0123456789012345678901234567890123', 'low_entropy'],
  ] as const)('rejects %j as %s', (value, problem) => {
    expect(findAuthSecretProblem(value)).toBe(problem)
  })
})

describe('assertAuthSecret', () => {
  it('fails in production for any problem, without echoing the secret', () => {
    for (const value of [undefined, EXAMPLE_AUTH_SECRET, 'short-one', 'z'.repeat(40)]) {
      let error: unknown
      try {
        assertAuthSecret(value, { production: true })
      }
      catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(InsecureAuthSecretError)
      if (value) expect((error as Error).message).not.toContain(value)
    }
  })

  it('passes in production with a strong secret', () => {
    expect(() => assertAuthSecret(strong(), { production: true })).not.toThrow()
  })

  it('outside production allows a placeholder with a warning that does not contain it', () => {
    const warn = vi.fn()
    assertAuthSecret(EXAMPLE_AUTH_SECRET, { production: false, warn })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).not.toContain(EXAMPLE_AUTH_SECRET)
  })

  it('outside production still requires a secret of usable length', () => {
    expect(() => assertAuthSecret(undefined, { production: false })).toThrow(InsecureAuthSecretError)
    expect(() => assertAuthSecret('short', { production: false })).toThrow(InsecureAuthSecretError)
  })
})

describe('estimateEntropyBits', () => {
  it('is zero for constant strings and high for random ones', () => {
    expect(estimateEntropyBits('aaaaaaaa')).toBe(0)
    expect(estimateEntropyBits(strong())).toBeGreaterThan(180)
  })
})

it('EXAMPLE_AUTH_SECRET matches the placeholder in .env.example', () => {
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  expect(example).toContain(`BETTER_AUTH_SECRET="${EXAMPLE_AUTH_SECRET}"`)
})
