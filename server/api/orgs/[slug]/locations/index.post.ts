import { createLocation } from '../../../../modules/tenancy/locations'

export default defineOrgHandler((ctx, { body, event }) => {
  setResponseStatus(event, 201)
  return createLocation(ctx, body)
})
