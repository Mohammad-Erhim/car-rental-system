/**
 * Accessible label for one library thumbnail. A media item carries no caption or filename, so this
 * falls back to the fields that exist — its purpose and type — plus a 1-based position so several
 * images of one purpose stay distinguishable to a screen-reader user.
 */
export function describeMedia(item: { purpose: string; mediaType: string }, index: number): string {
  const purpose = item.purpose.replace(/[_-]+/g, ' ').trim();
  const kind = item.mediaType.split('/')[1]?.toUpperCase() ?? item.mediaType;
  return purpose ? `${purpose} image ${index + 1}, ${kind}` : `Image ${index + 1}, ${kind}`;
}
