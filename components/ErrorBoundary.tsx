import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  // Explicitly declare state as a class property
  public state: State = {
    hasError: false
  };

  // Explicitly declare props to ensure TypeScript recognizes it
  public declare props: Readonly<Props>;

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white rounded-3xl shadow-xl">
            <div className="bg-red-100 p-6 rounded-full text-red-600 text-4xl mb-4">
                <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Something went wrong</h2>
            <p className="text-gray-500 mb-6 max-w-md">
                We encountered an unexpected error. This might be due to a connectivity issue or a temporary glitch.
            </p>
            <div className="bg-gray-100 p-4 rounded-lg mb-6 text-left w-full max-w-lg overflow-auto text-xs text-red-500 font-mono border border-red-200">
                {this.state.error?.toString()}
            </div>
            <button
                onClick={() => window.location.reload()}
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
            >
                Reload Application
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;