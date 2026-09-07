import { AppStateView } from '@carrental/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

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
      return (
        <div className="mx-auto max-w-md p-8">
          <AppStateView
            kind="failure"
            title="Something went wrong on this page"
            description="Nothing was changed. Reloading usually fixes it."
            primaryAction={{ label: 'Reload', onClick: () => window.location.reload() }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
