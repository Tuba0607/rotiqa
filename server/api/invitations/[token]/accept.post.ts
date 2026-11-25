import { acceptInvitation } from '../../../modules/tenancy/invitations'

export default defineApiHandler(async (event) => {
  const user = await requireUser(event)
  return acceptInvitation(usePrisma(), user.id, getRouterParam(event, 'token') ?? '')
})
