import { listInvitations } from '../../../../modules/tenancy/invitations'

export default defineOrgHandler(ctx => listInvitations(ctx))
