import { reorderEmployees } from '../../../../modules/staff/employees'

export default defineOrgHandler(async (ctx, { body }) => {
  await reorderEmployees(ctx, body)
  return { ok: true }
})
