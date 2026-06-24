import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';

/** The exact snippet site owners paste. The visible attribution <a> is the point:
 *  it is the backlink that makes the free widget worth shipping, and the path back
 *  to the full tool for their readers. Kept as a single source of truth so the page
 *  copy and the copy-to-clipboard button never drift. */
const EMBED_SNIPPET = `<iframe src="https://investax.app/embed/calculator"
  title="Calculator impozit investiții de la InvesTax"
  width="100%" height="680" loading="lazy"
  style="border:1px solid #e5e7eb;border-radius:12px;max-width:480px"></iframe>
<p style="font-size:12px;color:#6b7280;margin-top:6px">Calculator oferit de <a href="https://investax.app" target="_blank" rel="noopener">InvesTax</a></p>`;

export default function EmbedPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(EMBED_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the snippet is
      // selectable in the <pre> as a fallback, so just leave the button state.
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Widget gratuit: calculator de impozit pe investiții | InvesTax</title>
        <meta
          name="description"
          content="Adaugă gratuit calculatorul InvesTax de impozit pe investiții (câștiguri, dividende, CASS) pe site-ul sau blogul tău. Un singur cod de inserat, fără cont."
        />
      </Helmet>

      <h1 className="text-3xl font-bold mb-3">Pune calculatorul InvesTax pe site-ul tău</h1>
      <p className="text-gray-600 dark:text-slate-400 mb-8 leading-relaxed">
        Un calculator gratuit de impozit pe investiții (câștiguri de capital, dividende și CASS, pentru anul fiscal
        2025) pe care îl poți insera în orice pagină. Util cititorilor tăi care investesc prin Trading 212, Revolut
        sau Interactive Brokers. Fără cont, fără card, un singur cod de inserat.
      </p>

      <h2 className="text-xl font-bold mb-4">Cum arată</h2>
      <div className="mb-10">
        <iframe
          src="/embed/calculator"
          title="Previzualizare calculator impozit investiții InvesTax"
          width="100%"
          height={680}
          loading="lazy"
          className="rounded-xl border border-gray-200 dark:border-navy-700 max-w-[480px] bg-white"
        />
      </div>

      <h2 className="text-xl font-bold mb-3">Cum îl adaugi</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-4 leading-relaxed">
        Copiază codul de mai jos și lipește-l în pagina ta, acolo unde vrei să apară calculatorul.
      </p>
      <div className="relative mb-3">
        <pre className="card overflow-x-auto text-xs leading-relaxed p-4 pr-28 whitespace-pre-wrap break-all">
          <code>{EMBED_SNIPPET}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-3 right-3 btn-secondary inline-flex items-center gap-1.5 text-sm px-3 py-1.5"
          aria-label={copied ? 'Cod copiat' : 'Copiază codul de inserare'}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiat' : 'Copiază'}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-10">
        Vrei tema închisă? Adaugă <code className="text-accent dark:text-accent-light">?theme=dark</code> la finalul
        adresei din <code>src</code> (<code>.../embed/calculator?theme=dark</code>).
      </p>

      <h2 className="text-xl font-bold mb-3">De ce rămâne linkul către InvesTax</h2>
      <p className="text-gray-600 dark:text-slate-400 mb-10 leading-relaxed">
        Calculatorul e gratuit, iar linkul vizibil „Calculator oferit de InvesTax” e singura condiție: e felul în
        care cititorii tăi ajung la instrumentul complet, dacă vor să-și calculeze taxele din extrasul real. Te rugăm
        să-l păstrezi în cod.
      </p>

      <div className="card text-center">
        <p className="font-medium mb-2">Ai nevoie de ajutor la integrare sau vrei o altă dimensiune?</p>
        <p className="text-gray-600 dark:text-slate-400 mb-4 text-sm">
          Scrie-mi și te ajut. Poți testa și instrumentul complet, gratuit.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/contact" className="btn-primary">
            Contact
          </Link>
          <Link to="/verifica-extras" className="btn-secondary">
            Verifică un extras gratuit
          </Link>
        </div>
      </div>
    </div>
  );
}
