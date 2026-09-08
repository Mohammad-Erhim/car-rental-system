import { useI18n } from '@carrental/i18n/react';
import { AppStateView } from '@carrental/ui';
import { useNavigate } from 'react-router-dom';

export function OpsPlaceholder({ title, note }: { title: string; note: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-lg">
      <AppStateView
        kind="empty"
        title={title}
        description={note}
        primaryAction={{ label: t('ops.placeholder.back'), onClick: () => navigate('/') }}
      />
    </div>
  );
}
