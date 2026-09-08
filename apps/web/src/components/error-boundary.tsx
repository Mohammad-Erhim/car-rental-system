import { useI18n } from '@carrental/i18n/react';
import { AppStateView } from '@carrental/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

function CrashView() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md p-8">
      <AppStateView
        kind="failure"
        title={t('state.crash.title')}
        description={t('state.crash.body')}
        primaryAction={{ label: t('state.crash.reload'), onClick: () => window.location.reload() }}
      />
    </div>
  );
}

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Top-level error boundary — a crash still shows a recoverable state, never a blank page. */
export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <CrashView />;
    }
    return this.props.children;
  }
}
