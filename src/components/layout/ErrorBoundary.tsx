import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  /** Changing this (the page address) clears a shown error, so navigating away recovers. */
  resetKey: string;
}

/** Catches a crash while drawing a page, so one bad screen shows a message instead of a blank window. */
export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-neutral-300">The page hit an error and stopped drawing. Your saved work is kept in your browser and is not affected.</p>
        <pre className="mt-3 overflow-x-auto rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-red-300">{this.state.error.message}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">Try again</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900">Reload the page</button>
          <Link to="/" className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900">All projects</Link>
        </div>
        <p className="mt-4 text-xs text-neutral-500">If it keeps happening, export a backup from the project list, and tell the person who runs the app what you were doing and the message above.</p>
      </div>
    );
  }
}
