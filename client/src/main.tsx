import './i18n/i18n';
import { initErrorMonitor } from './lib/errorMonitor';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CountryProvider } from './contexts/CountryContext';
import { UploadProvider } from './contexts/UploadContext';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

// First-party client error capture: register global window.onerror +
// unhandledrejection handlers that beacon to /api/errors. Idempotent.
initErrorMonitor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <CountryProvider>
              <UploadProvider>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </UploadProvider>
            </CountryProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
