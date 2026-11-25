import { setEmployeeArchived } from '../../../../../modules/staff/employees'

export default defineOrgHandler((ctx, { event }) => setEmployeeArchived(ctx, uuidParam(event), false))
