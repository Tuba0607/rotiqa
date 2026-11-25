import { listMembers } from '../../../modules/tenancy/organizations'

export default defineOrgHandler(ctx => listMembers(ctx))
