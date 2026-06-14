import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../lib/errorMonitor';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Hardcoded copy. The boundary may be catching a failure in i18n or a context
// provider itself, so the fallback must NOT read from i18n/theme at runtime. We
// pick the language from the same source i18n persists to (localStorage
// 'language') or the document lang attribute, defaulting to ro (the launch market).
const COPY = {
  ro: { title: 'Ceva nu a mers bine. Reincarca pagina.', reload: 'Reincarca' },
  en: { title: 'Something went wrong. Please reload the page.', reload: 'Reload' },
} as const;

function pickLang(): 'ro' | 'en' {
  try {
    const stored = localStorage.getItem('language');
    if (stored === 'en') return 'en';
    if (stored === 'ro') return 'ro';
  } catch {
    // localStorage can throw (privacy mode); fall through to the document lang.
  }
  if (typeof document !== 'undefined' && document.documentElement.lang.startsWith('en')) return 'en';
  return 'ro';
}

// App-level error boundary. Catches render/lifecycle crashes in the React tree,
// reports them to the first-party error monitor with context 'react-render', and
// shows a minimal, self-contained fallback with a reload action. Inline styles
// only, so the fallback renders even if Tailwind/theme/i18n are the thing broken.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError({
      name: error.name,
      message: error.message,
      stack: error.stack ?? info.componentStack ?? undefined,
      context: 'react-render',
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const t = COPY[pickLang()];
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        <p style={{ fontSize: '1.125rem', margin: 0 }}>{t.title}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '0.6rem 1.4rem',
            fontSize: '1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#3b82f6',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          {t.reload}
        </button>
      </div>
    );
  }
}
