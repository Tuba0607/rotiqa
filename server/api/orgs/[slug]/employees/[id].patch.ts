import { updateEmployee } from '../../../../modules/staff/employees'

export default defineOrgHandler((ctx, { body, event }) => updateEmployee(ctx, uuidParam(event), body))
