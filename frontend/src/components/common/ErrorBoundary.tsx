import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6 font-sans">
          <div className="max-w-md w-full bg-surface-container-low rounded border border-error/30 p-6 space-y-4">
            <h1 className="text-xl font-bold font-mono text-on-surface">TRUDOC</h1>
            <h2 className="text-error font-semibold">Application Error</h2>
            <p className="text-sm text-on-surface-variant">
              Unable to render this workspace.
            </p>
            {this.state.error && (
              <pre className="text-[10px] font-mono text-on-surface-variant bg-surface-container-lowest p-3 rounded overflow-x-auto border border-outline-variant/20">
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-primary text-on-primary font-bold font-mono text-xs rounded hover:bg-primary-fixed transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
