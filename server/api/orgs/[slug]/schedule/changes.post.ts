import { saveScheduleChanges } from '../../../../modules/scheduling/changes'

/** Autosave: applies a batch of cell edits; conflicting cells are reported, never overwritten. */
export default defineOrgHandler((ctx, { body }) => saveScheduleChanges(ctx, body))
