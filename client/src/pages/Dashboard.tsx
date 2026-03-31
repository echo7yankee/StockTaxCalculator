import { Link } from 'react-router-dom';
import { Upload, Calculator, Clock } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8">
        Manage your tax years and calculations.
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        <Link to="/upload" className="card hover:border-accent transition-colors group">
          <Upload className="w-8 h-8 text-accent mb-3" />
          <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">Upload CSV</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Import transactions from your broker</p>
        </Link>

        <Link to="/calculator" className="card hover:border-accent transition-colors group">
          <Calculator className="w-8 h-8 text-accent mb-3" />
          <h3 className="text-lg font-semibold mb-1 group-hover:text-accent transition-colors">Quick Calculator</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Estimate taxes manually</p>
        </Link>

        <div className="card opacity-60">
          <Clock className="w-8 h-8 text-gray-400 dark:text-slate-500 mb-3" />
          <h3 className="text-lg font-semibold mb-1">Tax Years</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">Sign in to save and track calculations</p>
        </div>
      </div>
    </div>
  );
}
