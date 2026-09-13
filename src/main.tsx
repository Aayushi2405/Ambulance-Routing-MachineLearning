// @ts-nocheck
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import React from 'react';

class ErrorBoundary extends React.Component<{children: any}, {hasError: boolean, error: any}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any) { console.error("REACT CRASH DETECTED:", error); }
  render() { 
    if (this.state.hasError) return <div style={{background: "red", color: "white", padding: 20}}><h1>App Crashed</h1><pre>{String(this.state.error)}</pre></div>; 
    return this.props.children; 
  }
}

console.log("Mounting React Root...");
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
