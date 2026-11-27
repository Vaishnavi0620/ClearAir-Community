import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-12 max-w-xl rounded-xl border border-rose-200 bg-white p-6 text-slate-900">
          <h1 className="text-lg font-bold text-rose-800">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
          >
            Reload View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
