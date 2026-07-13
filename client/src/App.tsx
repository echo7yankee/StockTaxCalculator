import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/layout/Layout';
import SessionReset from './components/SessionReset';
import { analytics } from './lib/analytics';

const Landing = lazy(() => import('./pages/Landing'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const PreviewPage = lazy(() => import('./pages/PreviewPage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const FilingGuidePage = lazy(() => import('./pages/FilingGuidePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const GhidIndexPage = lazy(() => import('./pages/GhidIndexPage'));
const GhidTrading212Page = lazy(() => import('./pages/GhidTrading212Page'));
const GhidRevolutPage = lazy(() => import('./pages/GhidRevolutPage'));
const GhidIbkrPage = lazy(() => import('./pages/GhidIbkrPage'));
const GhidCassPage = lazy(() => import('./pages/GhidCassPage'));
const GhidDividendePage = lazy(() => import('./pages/GhidDividendePage'));
const GhidDeclaratieUnicaPage = lazy(() => import('./pages/GhidDeclaratieUnicaPage'));
const GhidCumCalculamPage = lazy(() => import('./pages/GhidCumCalculamPage'));
const GhidNotificareAnafPage = lazy(() => import('./pages/GhidNotificareAnafPage'));
const GhidXtbPage = lazy(() => import('./pages/GhidXtbPage'));
const EmbedPage = lazy(() => import('./pages/EmbedPage'));
const EmbedCalculatorPage = lazy(() => import('./pages/EmbedCalculatorPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  // First-party pageview tracking: fire on initial load and on every SPA route
  // change (replaces Plausible's automatic pushState pageview tracking).
  const location = useLocation();
  useEffect(() => {
    // Keep the operator's own admin views out of the first-party funnel data.
    if (location.pathname.startsWith('/admin')) return;
    analytics.pageview();
  }, [location.pathname]);

  return (
    <Suspense fallback={null}>
      {/* Clears the upload context + pending parse on any logged-in -> logged-out
          transition, so a shared machine never leaks the prior user's tax data. */}
      <SessionReset />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          {/* Free pre-paywall parse checker (backlog #24B). PUBLIC: no paywall,
              no auth guard, works for anonymous users. Engine-free by design. */}
          <Route path="/verifica-extras" element={<PreviewPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/filing-guide" element={<FilingGuidePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/embed" element={<EmbedPage />} />
          <Route path="/ghid" element={<GhidIndexPage />} />
          <Route path="/ghid/declaratie-unica-trading212" element={<GhidTrading212Page />} />
          <Route path="/ghid/declaratie-unica-revolut" element={<GhidRevolutPage />} />
          <Route path="/ghid/declaratie-unica-ibkr" element={<GhidIbkrPage />} />
          <Route path="/ghid/cass-investitii" element={<GhidCassPage />} />
          <Route path="/ghid/dividende-broker-strain" element={<GhidDividendePage />} />
          <Route path="/ghid/cum-completez-declaratia-unica" element={<GhidDeclaratieUnicaPage />} />
          <Route path="/ghid/cum-calculam" element={<GhidCumCalculamPage />} />
          <Route path="/ghid/notificare-anaf-venituri-strainatate" element={<GhidNotificareAnafPage />} />
          <Route path="/ghid/impozit-xtb" element={<GhidXtbPage />} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        {/* Chromeless, iframe-embeddable widget. Kept OUTSIDE the Layout group so
            it renders with no Header/Footer on third-party sites. The exact path
            outranks the Layout group's "*" catch-all. */}
        <Route path="/embed/calculator" element={<EmbedCalculatorPage />} />
      </Routes>
    </Suspense>
  );
}
