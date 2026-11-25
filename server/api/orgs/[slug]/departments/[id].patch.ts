import { updateDepartment } from '../../../../modules/staff/departments'

export default defineOrgHandler((ctx, { body, event }) => updateDepartment(ctx, uuidParam(event), body))
