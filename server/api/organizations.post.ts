import { createOrganization } from '../modules/tenancy/organizations'

/** Onboarding: organization + OWNER membership + first location, atomically. */
export default defineApiHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event).catch(() => undefined)
  setResponseStatus(event, 201)
  return createOrganization(usePrisma(), user.id, body)
})
