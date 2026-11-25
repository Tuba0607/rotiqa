/**
 * Local development seed: a demo OWNER account and the fictional "Kordon Bistro".
 *
 *   pnpm db:seed:dev
 *
 * - Goes through the real code paths: Better Auth for the account, the tenancy/staff
 *   services (runtime role, Row Level Security, audit log) for everything else.
 * - Idempotent: existing records are found and skipped, nothing is deleted or reset.
 *   An existing account keeps its password.
 * - Refuses to run anywhere but the local `rotiqa` development database.
 * - The generated password is printed once to the terminal and never written to disk.
 *
 * All names are invented; none belong to real people.
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createDepartment, listDepartments } from '../server/modules/staff/departments'
import { createEmployee, listEmployees } from '../server/modules/staff/employees'
import { runInOrganization } from '../server/modules/tenancy/access'
import { createLocation, listLocations } from '../server/modules/tenancy/locations'
import { createOrganization, listMyOrganizations } from '../server/modules/tenancy/organizations'
import { useAuth } from '../server/utils/auth'
import { usePrisma } from '../server/utils/db'

const OWNER = { name: 'Demo Owner', email: 'demo.sahip@kordonbistro.test' }
const ORGANIZATION = 'Kordon Bistro'
const LOCATIONS = ['Konyaaltı', 'Lara'] as const
const DEPARTMENTS = ['Salon', 'Mutfak', 'Bar'] as const

type Staff = [firstName: string, lastName: string, department: (typeof DEPARTMENTS)[number]]

const STAFF: Record<(typeof LOCATIONS)[number], Staff[]> = {
  Konyaaltı: [
    ['Defne', 'Aksoy', 'Salon'],
    ['Emir', 'Tekin', 'Salon'],
    ['Lale', 'Sarıkaya', 'Salon'],
    ['Kaan', 'Ergin', 'Salon'],
    ['Nehir', 'Yalçın', 'Mutfak'],
    ['Tuna', 'Karaca', 'Mutfak'],
    ['Ilgaz', 'Şenol', 'Mutfak'],
    ['Pelin', 'Acar', 'Mutfak'],
    ['Arda', 'Güven', 'Bar'],
    ['Melis', 'Tunç', 'Bar'],
  ],
  Lara: [
    ['Ceren', 'Ateş', 'Salon'],
    ['Bora', 'Uslu', 'Salon'],
    ['Su', 'Demirci', 'Salon'],
    ['Eren', 'Kılınç', 'Mutfak'],
    ['Ada', 'Özkan', 'Mutfak'],
    ['Çınar', 'Bal', 'Mutfak'],
    ['Deniz', 'Ekinci', 'Bar'],
    ['Yağmur', 'Oral', 'Bar'],
  ],
}

function assertLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.')
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is not set.')
  const url = new URL(raw)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/rotiqa') {
    throw new Error(`Refusing to seed: expected the local "rotiqa" database, got "${url.hostname}${url.pathname}".`)
  }
}

function generatePassword(): string {
  // 144 bits of randomness; base64url keeps it copy-paste friendly.
  return `Rq-${randomBytes(18).toString('base64url')}`
}

async function ensureOwner(): Promise<{ id: string, password: string | null }> {
  const prisma = usePrisma()
  const existing = await prisma.user.findUnique({ where: { email: OWNER.email }, select: { id: true } })
  if (existing) return { id: existing.id, password: null }

  const password = generatePassword()
  const result = await useAuth().api.signUpEmail({ body: { name: OWNER.name, email: OWNER.email, password } })
  return { id: result.user.id, password }
}

async function main(): Promise<void> {
  assertLocalDevelopmentDatabase()
  const prisma = usePrisma()
  const summary: string[] = []

  const owner = await ensureOwner()
  summary.push(owner.password ? 'Hesap oluşturuldu' : 'Hesap zaten vardı (şifre değiştirilmedi)')

  const organizations = await listMyOrganizations(prisma, owner.id)
  let organization = organizations.find(org => org.name === ORGANIZATION && org.role === 'OWNER')
  if (!organization) {
    organization = await createOrganization(prisma, owner.id, { name: ORGANIZATION, locationName: LOCATIONS[0], timezone: 'Europe/Istanbul' })
    summary.push(`İşletme oluşturuldu: ${organization.name} (/app/${organization.slug})`)
  }
  else {
    summary.push(`İşletme zaten vardı: ${organization.name} (/app/${organization.slug})`)
  }
  const slug = organization.slug

  const counts = await runInOrganization(prisma, owner.id, slug, async (ctx) => {
    const created = { locations: 0, departments: 0, employees: 0 }

    const locations = await listLocations(ctx)
    for (const name of LOCATIONS) {
      if (!locations.some(l => l.name === name)) {
        locations.push(await createLocation(ctx, { name, timezone: 'Europe/Istanbul' }))
        created.locations++
      }
    }

    const departments = await listDepartments(ctx, { includeInactive: true })
    for (const name of DEPARTMENTS) {
      if (!departments.some(d => d.name === name)) {
        departments.push(await createDepartment(ctx, { name }))
        created.departments++
      }
    }

    for (const locationName of LOCATIONS) {
      const location = locations.find(l => l.name === locationName)!
      const existing = [
        ...await listEmployees(ctx, { locationId: location.id, status: 'active' }),
        ...await listEmployees(ctx, { locationId: location.id, status: 'archived' }),
      ]
      for (const [firstName, lastName, departmentName] of STAFF[locationName]) {
        if (existing.some(e => e.firstName === firstName && e.lastName === lastName)) continue
        const department = departments.find(d => d.name === departmentName)!
        await createEmployee(ctx, { firstName, lastName, locationId: location.id, departmentId: department.id })
        created.employees++
      }
    }
    return created
  })
  summary.push(`Yeni eklenen → şube: ${counts.locations}, departman: ${counts.departments}, personel: ${counts.employees}`)

  console.log('\nRotiqa yerel demo verisi hazır')
  for (const line of summary) console.log(`  • ${line}`)
  console.log('\n  Giriş:   http://localhost:3000/giris')
  console.log(`  E-posta: ${OWNER.email}`)
  console.log(owner.password
    ? `  Şifre:   ${owner.password}   (yalnızca şimdi gösteriliyor; hiçbir yere kaydedilmedi)`
    : '  Şifre:   değiştirilmedi (ilk çalıştırmada gösterilmişti)')

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(`\nSeed başarısız: ${error instanceof Error ? error.message : String(error)}`)
  await usePrisma().$disconnect().catch(() => {})
  process.exit(1)
})
