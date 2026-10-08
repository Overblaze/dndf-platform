import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches a crash anywhere below it and shows what happened instead of a blank page. Without this,
 * one unreadable value on a character leaves no way back to the list of characters.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; where?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Crash in ${this.props.where ?? 'the app'}:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="card" role="alert">
        <h1>Something on this page broke</h1>
        <p>Nothing has been lost: your characters are saved as they were. This is a fault in the app, not something you did.</p>
        <p className="notice">{error.message || String(error)}</p>
        <div className="row wrap">
          <a className="btn btn-primary" href="#/sheet" onClick={() => this.setState({ error: null })}>Back to my characters</a>
          <button className="btn" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
        <p className="page-ref">If it happens again on the same character, tell Matt what you were doing and the line above.</p>
      </section>
    );
  }
}
