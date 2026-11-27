import { copyScheduleWeek } from '../../../../modules/scheduling/copy-week'

/** Copies a week's plan (default: the previous week) into the given week of the same location. */
export default defineOrgHandler((ctx, { body }) => copyScheduleWeek(ctx, body))
