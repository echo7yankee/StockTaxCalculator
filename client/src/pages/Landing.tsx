import { Link } from 'react-router-dom';
import { Upload, Calculator, FileText, ArrowRight } from 'lucide-react';

const steps = [
  { icon: Upload, title: 'Upload Statement', description: 'Upload your annual statement (PDF) or transaction export (CSV) from your broker.' },
  { icon: Calculator, title: 'We Calculate', description: 'Automatic tax computation using official exchange rates and tax rules.' },
  { icon: FileText, title: 'You File', description: 'Get the exact numbers you need for your annual tax declaration.' },
];

export default function Landing() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="py-20 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          Calculate your
          <span className="text-accent"> investment taxes</span>
          <br />in 2 minutes
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-slate-400 max-w-2xl mx-auto">
          Upload your broker statement, get tax-ready numbers. No spreadsheets, no accountant, no headaches.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/calculator" className="btn-primary text-lg px-8 py-3 flex items-center gap-2">
            Try Free Calculator <ArrowRight className="w-5 h-5" />
          </Link>
          <Link to="/upload" className="btn-secondary text-lg px-8 py-3">
            Upload Statement
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="card text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 text-accent mb-4">
                <step.icon className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-600 dark:text-slate-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported brokers */}
      <section className="py-16 text-center">
        <h2 className="text-2xl font-bold mb-8">Supported Brokers</h2>
        <div className="flex flex-wrap items-center justify-center gap-8 text-lg font-medium text-gray-500 dark:text-slate-400">
          <span className="px-6 py-3 card">Trading212</span>
          <span className="px-6 py-3 card opacity-60">Revolut (coming soon)</span>
          <span className="px-6 py-3 card opacity-60">IBKR (coming soon)</span>
        </div>
      </section>
    </div>
  );
}
