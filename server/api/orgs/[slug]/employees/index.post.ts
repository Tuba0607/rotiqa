import { createEmployee } from '../../../../modules/staff/employees'

export default defineOrgHandler((ctx, { body, event }) => {
  setResponseStatus(event, 201)
  return createEmployee(ctx, body)
})
