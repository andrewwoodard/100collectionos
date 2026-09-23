import React from "react";

/**
 * Lightweight error boundary that surfaces render-time exceptions as a visible
 * message instead of a silent empty page. Intended as a safety net so future
 * render errors (e.g. temporal-dead-zone references) are immediately obvious.
 */
export default class RenderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    console.error("[RenderErrorBoundary] Render crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <h3 className="font-semibold text-base mb-1">This page failed to render</h3>
            <p className="text-sm text-red-700 break-words">{this.state.message}</p>
            <button
              className="mt-3 text-xs font-medium text-red-700 underline hover:text-red-900"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}