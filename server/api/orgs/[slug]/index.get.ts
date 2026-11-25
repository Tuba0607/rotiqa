import { getOrganizationOverview } from '../../../modules/tenancy/organizations'

export default defineOrgHandler(ctx => getOrganizationOverview(ctx))
