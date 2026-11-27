import { getWeekSchedule } from '../../../../modules/scheduling/weeks'

/** Weekly planner data for one location: ?locationId=…&week=YYYY-MM-DD (any day of the week). */
export default defineOrgHandler((ctx, { query }) => getWeekSchedule(ctx, query))
