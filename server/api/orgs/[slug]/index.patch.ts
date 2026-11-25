import { updateOrganization } from '../../../modules/tenancy/organizations'

export default defineOrgHandler((ctx, { body }) => updateOrganization(ctx, body))
