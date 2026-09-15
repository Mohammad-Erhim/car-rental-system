/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Localized "1.2 km" / "850 m" via the shared `Formatters.number` (Intl unit style) — respects
 *  the active locale's numerals, spacing and RTL ordering instead of a hardcoded English suffix. */
export function formatDistanceKm(km: number, formatNumber: (v: number, opts?: Intl.NumberFormatOptions) => string): string {
  if (km < 1) {
    return formatNumber(Math.round(km * 1000), { style: 'unit', unit: 'meter', unitDisplay: 'short' });
  }
  return formatNumber(km, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: km < 10 ? 1 : 0,
  });
}
