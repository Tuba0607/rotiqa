import { listDepartments } from '../../../../modules/staff/departments'

export default defineOrgHandler((ctx, { query }) => listDepartments(ctx, { includeInactive: query.all === '1' }))
