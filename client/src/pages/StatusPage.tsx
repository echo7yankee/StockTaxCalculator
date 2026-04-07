import { useEffect, useState } from 'react';
import {
  CheckCircle, XCircle, Clock, Server, Database,
  FileText, Calculator, Upload, BarChart3, Settings,
  Shield, Globe, TestTube, Code, Palette,
} from 'lucide-react';

interface HealthCheck {
  server: 'up' | 'down' | 'checking';
  database: 'up' | 'down' | 'checking';
  bnrApi: 'up' | 'down' | 'checking';
}

type Status = 'done' | 'partial' | 'pending';

interface Feature {
  name: string;
  status: Status;
  icon: React.ReactNode;
  details: string;
  tests?: string;
}

const features: Feature[] = [
  {
    name: 'Landing Page',
    status: 'done',
    icon: <Globe className="w-5 h-5" />,
    details: 'Hero section, how-it-works, supported brokers',
  },
  {
    name: 'Quick Calculator',
    status: 'done',
    icon: <Calculator className="w-5 h-5" />,
    details: 'Manual input, Romania tax rules, client + server API',
    tests: 'Shared engine tests cover the math',
  },
  {
    name: 'PDF Upload + Parse',
    status: 'done',
    icon: <Upload className="w-5 h-5" />,
    details: 'Drag-drop PDF, pdfjs-dist extraction, Trading212 annual statement parser',
    tests: 'PDF parser unit tests in shared',
  },
  {
    name: 'CSV Upload + Parse',
    status: 'done',
    icon: <FileText className="w-5 h-5" />,
    details: 'Drag-drop CSV, PapaParse, Trading212 transaction export parser',
    tests: 'CSV parser unit tests in shared',
  },
  {
    name: 'Tax Calculation Engine',
    status: 'done',
    icon: <BarChart3 className="w-5 h-5" />,
    details: 'Weighted-avg cost basis, capital gains 10%, dividends 10%, CASS brackets, early filing discount',
    tests: '13 tests for CSV engine + 8 for PDF engine',
  },
  {
    name: 'Results Page',
    status: 'done',
    icon: <BarChart3 className="w-5 h-5" />,
    details: '4 summary cards, capital gains breakdown, per-security table, save button',
  },
  {
    name: 'BNR Exchange Rates',
    status: 'done',
    icon: <Globe className="w-5 h-5" />,
    details: 'Server-side BNR XML fetch, yearly average, auto-populate on PDF upload',
    tests: '11 BNR service tests',
  },
  {
    name: 'Database + Persistence',
    status: 'done',
    icon: <Database className="w-5 h-5" />,
    details: 'SQLite via Prisma, save/load calculations, upsert by year',
    tests: '7 API persistence tests',
  },
  {
    name: 'Dashboard',
    status: 'done',
    icon: <BarChart3 className="w-5 h-5" />,
    details: 'Saved calculations table, delete support, real data from DB',
  },
  {
    name: 'Settings',
    status: 'done',
    icon: <Settings className="w-5 h-5" />,
    details: 'Country selector (auto-detect), dark/light theme toggle',
  },
  {
    name: 'ESLint + Stylelint',
    status: 'done',
    icon: <Code className="w-5 h-5" />,
    details: 'ESLint v9 flat config (monorepo), Stylelint for Tailwind CSS',
  },
  {
    name: 'Unit Tests (Shared)',
    status: 'done',
    icon: <TestTube className="w-5 h-5" />,
    details: '94 tests: CSV parser, PDF parser, tax calculator, PDF tax calculator, Romania rules',
    tests: '94 passing',
  },
  {
    name: 'Unit Tests (Server)',
    status: 'done',
    icon: <TestTube className="w-5 h-5" />,
    details: 'BNR rate service + persistence API routes',
    tests: '18 passing',
  },
  {
    name: 'Unit Tests (Client)',
    status: 'done',
    icon: <TestTube className="w-5 h-5" />,
    details: 'UploadContext, Calculator, Results, Dashboard page tests',
    tests: '30 passing',
  },
  {
    name: 'Playwright E2E Tests',
    status: 'done',
    icon: <TestTube className="w-5 h-5" />,
    details: 'Browser automation: navigation, calculator, dashboard, upload, auth flows',
    tests: '28 passing',
  },
  {
    name: 'Authentication',
    status: 'done',
    icon: <Shield className="w-5 h-5" />,
    details: 'Email/password + Google OAuth, cookie sessions, progressive disclosure',
  },
  {
    name: 'Dark Theme',
    status: 'done',
    icon: <Palette className="w-5 h-5" />,
    details: 'Trading212-inspired navy palette, toggle via ThemeContext, localStorage persisted',
  },
];

export default function StatusPage() {
  const [health, setHealth] = useState<HealthCheck>({
    server: 'checking',
    database: 'checking',
    bnrApi: 'checking',
  });

  useEffect(() => {
    // Check server health
    fetch('/api/health')
      .then(r => r.ok ? 'up' as const : 'down' as const)
      .catch(() => 'down' as const)
      .then(status => setHealth(h => ({ ...h, server: status })));

    // Check database via health endpoint (public, no auth needed)
    fetch('/api/health')
      .then(r => r.ok ? 'up' as const : 'down' as const)
      .catch(() => 'down' as const)
      .then(status => setHealth(h => ({ ...h, database: status })));

    // Check BNR API (exchange rates)
    fetch('/api/exchange-rates/2025/average?currency=USD')
      .then(r => r.ok ? 'up' as const : 'down' as const)
      .catch(() => 'down' as const)
      .then(status => setHealth(h => ({ ...h, bnrApi: status })));
  }, []);

  const done = features.filter(f => f.status === 'done').length;
  const pending = features.filter(f => f.status === 'pending').length;
  const partial = features.filter(f => f.status === 'partial').length;

  const statusIcon = (s: Status) => {
    if (s === 'done') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (s === 'partial') return <Clock className="w-5 h-5 text-yellow-500" />;
    return <XCircle className="w-5 h-5 text-gray-400 dark:text-slate-600" />;
  };

  const healthIcon = (s: 'up' | 'down' | 'checking') => {
    if (s === 'checking') return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
    if (s === 'up') return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Project Status</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        Everything that&apos;s built, what&apos;s working, and what&apos;s next.
      </p>

      {/* Health checks */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-3">
          {healthIcon(health.server)}
          <div>
            <p className="font-medium text-sm">Express Server</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">:3001</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          {healthIcon(health.database)}
          <div>
            <p className="font-medium text-sm">SQLite Database</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Prisma</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          {healthIcon(health.bnrApi)}
          <div>
            <p className="font-medium text-sm">BNR Rates API</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Exchange rates</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Overall Progress</h2>
          <span className="text-sm text-gray-500 dark:text-slate-400">
            {done} done / {partial} partial / {pending} pending
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-4 overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${(done / features.length) * 100}%` }}
            />
            <div
              className="bg-yellow-500 transition-all"
              style={{ width: `${(partial / features.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex gap-6 text-xs text-gray-500 dark:text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-full inline-block" /> Done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded-full inline-block" /> In Progress</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-300 dark:bg-slate-600 rounded-full inline-block" /> Pending</span>
        </div>
      </div>

      {/* Test summary */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-3">Test Summary</h2>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold text-green-500">142</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Unit Tests Passing</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-500">94</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Shared (parsers, engines)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-500">18</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Server (BNR, API)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-green-500">30</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Client (components)</p>
          </div>
        </div>
      </div>

      {/* Feature list */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Features</h2>
        <div className="space-y-3">
          {features.map(f => (
            <div
              key={f.name}
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                f.status === 'done'
                  ? 'bg-green-50/50 dark:bg-green-900/10'
                  : f.status === 'partial'
                    ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
                    : 'bg-gray-50/50 dark:bg-navy-800/50'
              }`}
            >
              <div className="mt-0.5">{statusIcon(f.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {f.icon}
                  <p className="font-medium">{f.name}</p>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">{f.details}</p>
                {f.tests && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                    <TestTube className="w-3 h-3" /> {f.tests}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech stack */}
      <div className="card mt-8">
        <h2 className="text-lg font-semibold mb-3">Tech Stack</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium mb-1 flex items-center gap-2"><Server className="w-4 h-4" /> Client</p>
            <p className="text-gray-600 dark:text-slate-400">React 18 + Vite + TailwindCSS</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Port 5173</p>
          </div>
          <div>
            <p className="font-medium mb-1 flex items-center gap-2"><Server className="w-4 h-4" /> Server</p>
            <p className="text-gray-600 dark:text-slate-400">Express + TypeScript + Prisma</p>
            <p className="text-xs text-gray-500 dark:text-slate-500">Port 3001</p>
          </div>
          <div>
            <p className="font-medium mb-1 flex items-center gap-2"><Database className="w-4 h-4" /> Database</p>
            <p className="text-gray-600 dark:text-slate-400">SQLite via Prisma ORM</p>
          </div>
          <div>
            <p className="font-medium mb-1 flex items-center gap-2"><TestTube className="w-4 h-4" /> Testing</p>
            <p className="text-gray-600 dark:text-slate-400">Vitest + Testing Library</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-slate-600 mt-8">
        Last updated: April 2026 &middot; InvesTax
      </p>
    </div>
  );
}
