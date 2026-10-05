// frontend/src/lib/events.ts
/**
 * Fired on window (with a project slug as `detail`) by anything outside the
 * timeline that wants a specific project's sheet opened — the nav menu, for
 * one. ProjectTimeline listens for it.
 */
export const OPEN_PROJECT_EVENT = 'open-project';
