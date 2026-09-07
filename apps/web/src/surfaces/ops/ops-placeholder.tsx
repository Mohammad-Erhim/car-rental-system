import { AppStateView } from '@carrental/ui';
import { useNavigate } from 'react-router-dom';

export function OpsPlaceholder({ title, note }: { title: string; note: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-lg">
      <AppStateView
        kind="empty"
        title={title}
        description={note}
        primaryAction={{ label: 'Back to dashboard', onClick: () => navigate('/ops') }}
      />
    </div>
  );
}
