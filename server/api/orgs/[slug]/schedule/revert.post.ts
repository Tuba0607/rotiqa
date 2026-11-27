import { revertScheduleChangeSet } from '../../../../modules/scheduling/changes'

/** Undo (or redo) one of the signed-in user's own change sets. */
export default defineOrgHandler((ctx, { body }) => revertScheduleChangeSet(ctx, body))
