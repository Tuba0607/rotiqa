import { getEmployee } from '../../../../modules/staff/employees'

export default defineOrgHandler((ctx, { event }) => getEmployee(ctx, uuidParam(event)))
