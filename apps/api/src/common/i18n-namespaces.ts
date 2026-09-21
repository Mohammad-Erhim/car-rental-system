/**
 * Translation namespaces for dashboard-entered text that lives on a database row rather than in a
 * UI bundle (DEC-037). The English text stays on the row; every other language is a `translation`
 * row under one of these namespaces, edited on the dashboard's Translations screen and served
 * (published only) by the endpoint that returns the row. Keys are the row's stable code; a second
 * text field of the same row is `<code>.<suffix>`.
 */
export const LOCATION_NS = 'catalogue:location';
export const PRODUCT_NS = 'catalogue:product';

/** a location's instructions, next to its name under the same code */
export const LOCATION_PICKUP_SUFFIX = '.pickup';
export const LOCATION_RETURN_SUFFIX = '.return';
