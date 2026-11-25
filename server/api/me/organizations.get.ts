import { listMyOrganizations } from '../../modules/tenancy/organizations'

export default defineApiHandler(async (event) => {
  const user = await requireUser(event)
  return listMyOrganizations(usePrisma(), user.id)
})
