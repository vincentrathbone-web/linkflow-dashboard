import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SyncDiagnosticsPanel } from './components/SyncDiagnosticsPanel.tsx';
import { TimerWidget } from './components/TimerWidget.tsx';
import './index.css';

const rootElement = document.getElementById('linkflow-dashboard-root') || document.getElementById('root');

if (!rootElement) {
  throw new Error('Unable to find the LinkFlow application root.');
}

// Opened in its own window/tab via the "Sync diagnostics" nav link, instead of
// always rendering on top of the app.
const isDiagnosticsWindow = window.location.hash === '#diagnostics';

// Opened in its own always-on-top, chromeless desktop window (see
// openTimerWidget() in App.tsx) when the "Floating Timer Widget" setting is on.
const isTimerWidgetWindow = window.location.hash === '#timer-widget';

createRoot(rootElement).render(
  <StrictMode>
    {isDiagnosticsWindow ? <SyncDiagnosticsPanel standalone /> : isTimerWidgetWindow ? <TimerWidget /> : <App />}
  </StrictMode>,
);
