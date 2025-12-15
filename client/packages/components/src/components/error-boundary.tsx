// from https://react-typescript-cheatsheet.netlify.app/docs/basic/getting-started/error_boundaries/#option-2-writing-your-custom-error-boundary-component

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-4 bg-white p-6 dark:bg-neutral-800">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Something went wrong
              </h2>
              <p className="max-w-md text-sm text-gray-500 dark:text-neutral-400">
                An unexpected error occurred. Please try again or contact
                support if the problem persists.
              </p>
            </div>
            {this.state.error && (
              <details className="mt-2 w-full max-w-md">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-300">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-left font-mono text-xs text-gray-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
          <button
            onClick={this.handleRetry}
            className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-sm bg-[#606AF4] px-8 py-1 font-bold whitespace-nowrap text-white transition-all hover:bg-[#4543e9]"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
