/**
 * HTTP adapter for the Announcements module (Task 011).
 *
 * Thin route-handler helpers: request parsing (Zod) and error mapping only.
 * No business logic here — handlers delegate to
 * `modules/announcements/application/*` use cases and translate results into
 * DTOs (`lib/api/README.md`, CLAUDE.md §25/§28/§29).
 */

import { toApiErrorResponse } from './errors';

export { parseBody, toApiErrorResponse } from './errors';

/** Announcements-alias of the shared error mapper. */
export const toAnnouncementErrorResponse = toApiErrorResponse;