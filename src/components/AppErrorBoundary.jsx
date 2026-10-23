import React from 'react';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('MoveZW screen failed:', error, info);
  }

  render() {
    if (this.state.failed) {
      return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <h1 className="text-xl font-semibold">MoveZW could not open this screen</h1>
        <p className="text-sm text-muted-foreground">Close and reopen the app. If this continues, update MoveZW and Android System WebView.</p>
        <button type="button" onClick={() => window.location.replace('/')} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Open home</button>
      </div>;
    }
    return this.props.children;
  }
}
