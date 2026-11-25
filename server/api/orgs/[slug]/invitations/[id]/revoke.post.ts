import { revokeInvitation } from '../../../../../modules/tenancy/invitations'

export default defineOrgHandler(async (ctx, { event }) => {
  await revokeInvitation(ctx, uuidParam(event))
  return { ok: true }
})
