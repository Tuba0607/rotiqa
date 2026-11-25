import { listLocations } from '../../../../modules/tenancy/locations'

export default defineOrgHandler(ctx => listLocations(ctx))
