import { updateLocation } from '../../../../modules/tenancy/locations'

export default defineOrgHandler((ctx, { body, event }) => updateLocation(ctx, uuidParam(event), body))
