import { NotFoundContent } from '../../components/not-found-content';

/** Locale-agnostic 404 (the segment 404 also renders here). Body is localised client-side. */
export default function NotFound() {
  return <NotFoundContent />;
}
