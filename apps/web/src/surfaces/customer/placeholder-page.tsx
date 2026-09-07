import { AppStateView } from '@carrental/ui';
import { useNavigate } from 'react-router-dom';

/** Temporary content for customer routes whose full screen lands in a later stage. */
export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-lg">
      <AppStateView
        kind="empty"
        title={title}
        description={note}
        primaryAction={{ label: 'Back to home', onClick: () => navigate('/') }}
      />
    </div>
  );
}
