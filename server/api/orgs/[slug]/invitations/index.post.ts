import { createInvitation } from '../../../../modules/tenancy/invitations'

/** Returns the one-time token so the owner can copy the link. No email is sent. */
export default defineOrgHandler((ctx, { body, event }) => {
  setResponseStatus(event, 201)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return createInvitation(ctx, body)
})
