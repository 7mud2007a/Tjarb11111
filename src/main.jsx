import React from 'react';
import { createRoot } from 'react-dom/client';
import JellySliderDemo from './jelly-slider/JellySliderDemo.jsx';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Jelly Slider failed to render:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', boxSizing: 'border-box', padding: 24, background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ color: '#ffb357' }}>Jelly Slider</h1>
          <p>The animation could not start. You can still test the slider below.</p>
          <label htmlFor="safe-slider">Value: <output id="safe-slider-value">48</output>%</label>
          <input id="safe-slider" type="range" min="0" max="100" defaultValue="48" style={{ display: 'block', width: '100%', marginTop: 16 }} onInput={(event) => { document.getElementById('safe-slider-value').value = event.currentTarget.value; }} />
          <details style={{ marginTop: 24 }}>
            <summary>Technical error</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <AppErrorBoundary>
      <JellySliderDemo />
    </AppErrorBoundary>
  );
}
