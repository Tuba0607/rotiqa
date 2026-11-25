import { listEmployees } from '../../../../modules/staff/employees'

export default defineOrgHandler((ctx, { query }) => listEmployees(ctx, query))
