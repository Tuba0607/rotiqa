import { listScheduleHistory } from '../../../../modules/scheduling/history'

/** Saved change sets of a location week, newest first: ?locationId=…&week=YYYY-MM-DD (Monday). */
export default defineOrgHandler((ctx, { query }) => listScheduleHistory(ctx, query))
