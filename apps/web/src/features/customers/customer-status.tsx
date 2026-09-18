import { Badge } from '@/components/ui/badge';

/** Customer record status as a badge (text label always shown). */
export function CustomerStatus({ status }: { status: string }) {
  const variant = status === 'active' ? 'success' : status === 'merged' ? 'secondary' : 'warning';
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
