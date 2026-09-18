/** Lifecycle states, as the API reports them (labels live under `ops.status.*`). */
export const RESERVATION_STATES = ['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'];
export const RENTAL_STATES = ['awaiting_pickup', 'active', 'overdue', 'closed'];
