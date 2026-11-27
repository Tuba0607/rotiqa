import { listShiftCodes } from '../../../modules/scheduling/shift-codes'

export default defineOrgHandler((ctx, { query }) => listShiftCodes(ctx.tx, ctx.organization.id, { includeInactive: query.all === '1' }))
