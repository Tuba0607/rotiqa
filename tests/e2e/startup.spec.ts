import { spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { EXAMPLE_AUTH_SECRET } from '../../server/modules/security/auth-secret'

/** Starts the production build with the given secret and reports whether it refused to boot. */
function startServer(secret: string | undefined, port: number): Promise<{ exited: boolean, output: string }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), DATABASE_URL: process.env.TEST_DATABASE_URL ?? '', BETTER_AUTH_URL: `http://localhost:${port}` }
    delete env.BETTER_AUTH_SECRET
    if (secret !== undefined) env.BETTER_AUTH_SECRET = secret
    const child = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    const timer = setTimeout(() => {
      child.kill()
      resolve({ exited: false, output })
    }, 5000)
    child.on('exit', () => {
      clearTimeout(timer)
      resolve({ exited: true, output })
    })
  })
}

test.describe('production startup', () => {
  test.skip(({ isMobile }) => isMobile, 'Process-level check; one browser project is enough.')

  for (const [label, secret, port] of [
    ['missing', undefined, 3191],
    ['the .env.example placeholder', EXAMPLE_AUTH_SECRET, 3192],
    ['a weak secret', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 3193],
  ] as const) {
    test(`refuses to start with ${label} BETTER_AUTH_SECRET and does not log it`, async () => {
      const { exited, output } = await startServer(secret, port)
      expect(exited).toBe(true)
      expect(output).toContain('BETTER_AUTH_SECRET')
      if (secret) expect(output).not.toContain(secret)
    })
  }
})
