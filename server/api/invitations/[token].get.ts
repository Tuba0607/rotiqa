import { previewInvitation } from '../../modules/tenancy/invitations'

/** Public: lets the invitee see which business invited them before signing in. */
export default defineApiHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return previewInvitation(usePrisma(), getRouterParam(event, 'token') ?? '')
})
