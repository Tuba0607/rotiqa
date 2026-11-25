export interface OrganizationOverview {
  organization: { id: string, name: string, slug: string }
  role: 'OWNER' | 'MANAGER'
  locations: { id: string, name: string, timezone: string, isActive: boolean }[]
  stats: { activeEmployees: number, departments: number, locations: number }
}

export interface OrganizationSummary { id: string, name: string, slug: string, role: 'OWNER' | 'MANAGER' }

/** Current organization (from the /app/[org] route) with the user's role and visible locations. */
export function useOrganization() {
  const route = useRoute()
  const slug = computed(() => String(route.params.org ?? ''))
  const request = useFetch<OrganizationOverview>(() => `/api/orgs/${slug.value}`, { key: computed(() => `org:${slug.value}`), dedupe: 'defer' })
  const isOwner = computed(() => request.data.value?.role === 'OWNER')
  const activeLocations = computed(() => request.data.value?.locations.filter(l => l.isActive) ?? [])
  return { slug, ...request, isOwner, activeLocations }
}

/** Organizations of the signed-in user (switcher). */
export function useMyOrganizations() {
  return useFetch<OrganizationSummary[]>('/api/me/organizations', { key: 'me:organizations', dedupe: 'defer' })
}

/** Prefix for links inside the current organization. */
export function useOrgPath() {
  const route = useRoute()
  return (path = '') => `/app/${String(route.params.org ?? '')}${path}`
}
