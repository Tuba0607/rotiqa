import { createDepartment } from '../../../../modules/staff/departments'

export default defineOrgHandler((ctx, { body, event }) => {
  setResponseStatus(event, 201)
  return createDepartment(ctx, body)
})
