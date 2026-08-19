/**
 * HTTP adapter for the Results module (Task 006D Part W).
 *
 * Thin route-handler helpers: request parsing (Zod) and error mapping only.
 * No business logic here — handlers delegate to
 * `modules/grades/application/*` use cases and translate results into DTOs
 * (`lib/api/README.md`, CLAUDE.md §25/§28/§29).
 *
 * The generic helpers live in `./errors` and are re-exported here so Results
 * routes keep their stable surface.
 */

import { toApiErrorResponse } from './errors';

export { parseBody, toApiErrorResponse } from './errors';

/** Results-alias of the shared error mapper (kept for route stability). */
export const toResultErrorResponse = toApiErrorResponse;