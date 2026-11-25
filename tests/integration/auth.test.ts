import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '../../server/utils/auth'
import { closeConnections, ownerPool, resetDatabase } from './helpers'

/** Better Auth against the real database through the runtime role. */

const auth = () => useAuth()
const password = 'güçlü-Parola-123'

async function signUp(email: string, name = 'Ayşe Demir') {
  return auth().api.signUpEmail({ body: { name, email, password }, asResponse: true })
}

function sessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]!)
  const session = cookies.find(c => c.includes('session_token'))
  if (!session) throw new Error('No session cookie set')
  return cookies.join('; ')
}

beforeEach(resetDatabase)
afterAll(closeConnections)

describe('registration', () => {
  it('creates the user with a hashed password and starts a session', async () => {
    const response = await signUp('ayse@example.test')
    expect(response.status).toBe(200)

    const { rows } = await ownerPool.query(`SELECT a.password, a.provider_id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = 'ayse@example.test'`)
    expect(rows[0].provider_id).toBe('credential')
    expect(rows[0].password).not.toContain(password)
    expect(rows[0].password.length).toBeGreaterThan(40)

    const session = await auth().api.getSession({ headers: new Headers({ cookie: sessionCookie(response) }) })
    expect(session?.user.email).toBe('ayse@example.test')
  })

  it('rejects a duplicate email (case-insensitive)', async () => {
    await signUp('ayse@example.test')
    const duplicate = await signUp('AYSE@example.test')
    expect(duplicate.status).toBe(422)
    expect((await duplicate.json()).code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
    const { rows } = await ownerPool.query(`SELECT count(*)::int AS n FROM users`)
    expect(rows[0].n).toBe(1)
  })

  it('rejects short passwords and invalid emails', async () => {
    const short = await auth().api.signUpEmail({ body: { name: 'A', email: 'a@example.test', password: 'kisa' }, asResponse: true })
    expect((await short.json()).code).toBe('PASSWORD_TOO_SHORT')
    const invalid = await auth().api.signUpEmail({ body: { name: 'A', email: 'not-an-email', password }, asResponse: true })
    expect(invalid.status).toBe(400)
  })
})

describe('sign-in and sign-out', () => {
  it('rejects a wrong password without revealing which field was wrong', async () => {
    await signUp('ayse@example.test')
    const wrong = await auth().api.signInEmail({ body: { email: 'ayse@example.test', password: 'yanlis-parola-1' }, asResponse: true })
    const unknown = await auth().api.signInEmail({ body: { email: 'kimse@example.test', password }, asResponse: true })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect((await wrong.json()).code).toBe((await unknown.json()).code)
  })

  it('signs in, and signing out invalidates the session', async () => {
    await signUp('ayse@example.test')
    const signIn = await auth().api.signInEmail({ body: { email: 'ayse@example.test', password }, asResponse: true })
    const headers = new Headers({ cookie: sessionCookie(signIn) })
    expect(await auth().api.getSession({ headers })).not.toBeNull()

    await auth().api.signOut({ headers })
    expect(await auth().api.getSession({ headers })).toBeNull()
  })

  it('has no session without a cookie or with a forged one', async () => {
    expect(await auth().api.getSession({ headers: new Headers() })).toBeNull()
    expect(await auth().api.getSession({ headers: new Headers({ cookie: 'better-auth.session_token=forged.value' }) })).toBeNull()
  })
})
