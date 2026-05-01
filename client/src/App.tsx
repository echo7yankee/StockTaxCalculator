import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';

const Landing = lazy(() => import('./pages/Landing'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
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
const GhidCassPage = lazy(() => import('./pages/GhidCassPage'));
const GhidDividendePage = lazy(() => import('./pages/GhidDividendePage'));
const GhidDeclaratieUnicaPage = lazy(() => import('./pages/GhidDeclaratieUnicaPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
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
          <Route path="/ghid" element={<GhidIndexPage />} />
          <Route path="/ghid/declaratie-unica-trading212" element={<GhidTrading212Page />} />
          <Route path="/ghid/declaratie-unica-revolut" element={<GhidRevolutPage />} />
          <Route path="/ghid/cass-investitii" element={<GhidCassPage />} />
          <Route path="/ghid/dividende-broker-strain" element={<GhidDividendePage />} />
          <Route path="/ghid/cum-completez-declaratia-unica" element={<GhidDeclaratieUnicaPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
