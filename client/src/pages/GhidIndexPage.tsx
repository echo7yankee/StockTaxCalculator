import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, Calculator, FileText } from 'lucide-react';
import {
  GHID_LIST,
  GHID_INDEX_COLLECTION_SCHEMA as collectionSchema,
  GHID_INDEX_META as meta,
} from '../lib/ghidIndexSchemas';

export default function GhidIndexPage() {
  const navigate = useNavigate();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={meta.url} />
        <meta property="og:title" content="Ghiduri Declarația Unică pentru investitori" />
        <meta
          property="og:description"
          content="Trading212, Revolut, dividende, CASS, completarea D212. Pentru anul fiscal 2025."
        />
        <meta property="og:url" content={meta.url} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
      </Helmet>

      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent dark:hover:text-accent-light mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Acasă
      </button>

      <header className="mb-10">
        <p className="text-sm text-accent dark:text-accent-light font-medium mb-2">Ghiduri</p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
          Ghiduri Declarația Unică pentru investitori
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Tot ce ai nevoie ca să declari corect veniturile din investiții pentru anul fiscal 2025. Deadline: 25 mai
          2026.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">De unde să începi</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Dacă ești la prima Declarație Unică, citește mai întâi ghidul general (cum completezi D212 pe SPV). Apoi
          citește ghidul specific brokerului tău (Trading212 sau Revolut). Dacă primești dividende sau ai mai mulți
          brokeri, ghidul de dividende străine îți explică creditul fiscal. CASS-ul are propriul ghid pentru că surpinde
          mulți investitori la prima declarație.
        </p>
      </section>

      <section className="mb-12 space-y-4">
        {GHID_LIST.map((g) => (
          <button
            key={g.path}
            onClick={() => navigate(g.path)}
            className="w-full text-left p-5 border border-gray-200 dark:border-navy-700 rounded-xl hover:border-accent dark:hover:border-accent-light hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors group"
          >
            <h2 className="text-lg font-semibold mb-2 group-hover:text-accent dark:group-hover:text-accent-light transition-colors">
              {g.title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed mb-3">{g.description}</p>
            <span className="inline-flex items-center gap-1 text-sm text-accent dark:text-accent-light font-medium">
              Citește ghidul <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        ))}
      </section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Sau folosește calculatorul</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Dacă ai cifrele tale brute, calculatorul InvesTax aplică automat metoda CMP, cursurile BNR, ratele de
              dividende și pragurile CASS. Calculator manual gratuit, plan plătit pentru încărcarea automată a
              extraselor PDF.
            </p>
            <button onClick={() => navigate('/calculator')} className="btn-primary inline-flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Deschide calculatorul
            </button>
          </div>
        </div>
      </section>

      <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-navy-700 text-sm text-gray-500 dark:text-slate-400">
        <p>
          Ghidurile sunt informative și acoperă regulile aplicabile pentru anul fiscal 2025 (depus în 2026). Pentru
          situații complexe consultă un contabil. ANAF publică ghidul oficial al Declarației Unice anual pe anaf.ro.
        </p>
      </footer>
    </article>
  );
}
