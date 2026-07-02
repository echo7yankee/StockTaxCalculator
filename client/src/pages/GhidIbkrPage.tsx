import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator, ShieldAlert } from 'lucide-react';
import {
  GHID_IBKR_FAQS as FAQS,
  GHID_IBKR_ARTICLE_SCHEMA as articleSchema,
  GHID_IBKR_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidIbkrSchemas';
import GhidRelatedGuides from '../components/common/GhidRelatedGuides';
import EmailCapture from '../components/common/EmailCapture';

export default function GhidIbkrPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026 | InvesTax</title>
        <meta
          name="description"
          content="Ghid Interactive Brokers (IBKR): cum scoți extrasul Activity Statement (CSV) și cum declari câștigurile și dividendele în Declarația Unică 2026. Termen 25 mai."
        />
        <link rel="canonical" href="https://investax.app/ghid/declaratie-unica-ibkr/" />
        <meta property="og:title" content="Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026" />
        <meta
          property="og:description"
          content="Ghid pentru investitorii IBKR: ce extras scoți, în ce format, cum declari câștigurile și dividendele. Deadline 25 mai 2026."
        />
        <meta property="og:url" content="https://investax.app/ghid/declaratie-unica-ibkr/" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <Link
        to="/"
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent dark:hover:text-accent-light mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Acasă
      </Link>

      <header className="mb-10">
        <p className="text-sm text-accent dark:text-accent-light font-medium mb-2">Ghid</p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
          Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Deadline: 25 mai 2026, pentru anul fiscal 2025. IBKR nu are reprezentanță în România, deci îți faci singur
          calculele și le treci în Declarația Unică. Partea specifică IBKR: ce extras scoți și în ce format.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Interactive Brokers nu are sediu permanent în România, deci nu reține impozitul la sursă. Tu calculezi
          câștigul net și îl declari în Declarația Unică (D212), depusă online pe portalul ANAF SPV până pe 25 mai.
          Regimul fiscal este identic cu Trading212: 10% pe câștigul net din tranzacții și 10% pe dividende (cu credit
          pentru reținerea străină), plus CASS dacă totalul veniturilor non-salariale depășește 6 salarii minime.
          Singura parte cu adevărat specifică IBKR este extrasul corect: <strong>Activity Statement în format CSV</strong>.
        </p>
        <p className="mt-3 text-sm">
          <Link
            to="/pricing/"
            className="text-accent dark:text-accent-light font-medium underline hover:no-underline"
          >
            Vrei calculul automat din extrasul IBKR? Vezi planuri →
          </Link>
        </p>
      </section>

      <section className="mb-10 p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          IBKR este în beta. Verifică cifrele înainte să depui.
        </h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Suportul pentru Interactive Brokers este construit pe formatul publicat al extrasului Activity Statement, dar
          nu am validat încă suficiente extrase reale de la utilizatori. Până confirmăm cel puțin 3 extrase reale care
          se procesează corect end-to-end, IBKR rămâne marcat ca beta: compară întotdeauna rezultatul cu extrasul tău
          înainte să trimiți declarația. Dacă vezi vreun avertisment la procesare, nu depune până nu lămurim împreună
          situația. Pentru Trading212, în schimb, parserul este validat pe extrase reale.
        </p>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed mt-3">
          Vrei să fii sigur că îți putem citi extrasul IBKR înainte să plătești?{' '}
          <Link to="/verifica-extras" className="text-accent dark:text-accent-light font-medium underline hover:no-underline">
            Verifică-l gratuit
          </Link>
          .
        </p>
      </section>

      <Section title="Ce extras scoți din IBKR și în ce format">
        <p>
          Aici greșesc cei mai mulți: IBKR oferă mai multe tipuri de rapoarte, iar InvesTax citește un singur format,{' '}
          <strong>Activity Statement exportat ca CSV</strong>. Pașii din Client Portal:
        </p>
        <ol className="list-decimal list-outside pl-6 space-y-2 mt-3">
          <li>
            Autentifică-te în <strong>Client Portal</strong> (interactivebrokers.com / interactivebrokers.ie pentru
            clienții europeni).
          </li>
          <li>
            Mergi la <strong>Performance &amp; Reports → Statements</strong>.
          </li>
          <li>
            Alege <strong>Activity</strong> (extrasul de activitate), <em>nu</em> Flex Query și nici raportul implicit
            de tip MTM.
          </li>
          <li>
            Setează perioada pe <strong>anul fiscal complet</strong> (de la 1 ianuarie până la 31 decembrie 2025). IBKR limitează un
            fișier la maximum un an, deci pentru fiecare an scoți un export separat.
          </li>
          <li>
            La format alege <strong>CSV</strong> și apasă Run / Download.
          </li>
        </ol>
        <p className="mt-4">
          Extrasul corect conține mai multe secțiuni concatenate în același fișier: <strong>Trades</strong> (tranzacții),{' '}
          <strong>Dividends</strong> (dividende), <strong>Withholding Tax</strong> (reținerea la sursă) și{' '}
          <strong>Financial Instrument Information</strong> (maparea simbol → ISIN). Pe astea le folosește calculul.
        </p>
        <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Flex Query nu este același lucru.</strong> Este un raport configurabil, cu altă structură și
              denumiri de câmpuri (camelCase), pe care InvesTax nu îl citește momentan. Dacă încarci un Flex Query,
              procesarea va eșua sau va afișa un avertisment. Folosește Activity Statement-ul standard.
            </span>
          </p>
        </div>
      </Section>

      <Section title="Ce este acoperit în beta">
        <p>Suportul IBKR în beta procesează:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>
            <strong>Acțiuni și ETF-uri.</strong> Opțiunile, futures, forex, obligațiunile și CFD-urile sunt momentan
            ignorate, cu un avertisment afișat (preferăm să te avertizăm decât să raportăm un număr parțial).
          </li>
          <li>
            <strong>Valutele USD, EUR, GBP și RON.</strong> Alte valute (CHF, CAD, JPY etc.) sunt ignorate cu
            avertisment, până implementăm conversia multi-valutară completă.
          </li>
          <li>
            <strong>Comisioanele</strong> sunt incluse automat: se adaugă la cost la cumpărare și se scad din încasări
            la vânzare, conform regulilor ANAF privind cheltuielile deductibile de transfer.
          </li>
        </ul>
        <p className="mt-3">
          Dacă portofoliul tău conține instrumente sau valute din afara acestui set, calculează-le separat și verifică
          manual înainte de depunere.
        </p>
      </Section>

      <Section title="Cum se declară, pe scurt">
        <p>
          Mecanica fiscală pentru IBKR este aceeași ca pentru orice broker fără reprezentanță în România. Pe scurt:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Câștigul net din tranzacții:</strong> 10% pentru anul fiscal 2025. Conversia în RON se face la
            cursul BNR din <strong>data fiecărei tranzacții</strong> (Codul Fiscal art. 96).
          </li>
          <li>
            <strong>Dividendele din străinătate:</strong> 10%, cu credit pentru impozitul reținut în țara sursă.
            Conversia în RON se face la <strong>cursul mediu anual BNR</strong> comunicat pentru anul venitului (Codul
            Fiscal art. 131 alin. 6), nu la cursul din ziua plății.
          </li>
          <li>
            <strong>CASS:</strong> 10% pe praguri (6 / 12 / 24 salarii minime), calculat pe suma tuturor veniturilor
            non-salariale, nu doar pe cele de la IBKR.
          </li>
        </ul>
        <p className="mt-4">
          Pașii detaliați, exemplul numeric și completarea propriu-zisă a D212 sunt identice cu cele din ghidul
          Trading212, pentru că ambele sunt brokeri fără reprezentanță în România:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>
            <Link to="/ghid/declaratie-unica-trading212/" className="text-accent dark:text-accent-light hover:underline">
              Ghidul pas cu pas (cu exemplu numeric lucrat)
            </Link>
          </li>
          <li>
            <Link to="/ghid/cum-calculam/" className="text-accent dark:text-accent-light hover:underline">
              Metodologia InvesTax (CMP, cursuri BNR, citate Codul Fiscal)
            </Link>
          </li>
          <li>
            <Link to="/ghid/dividende-broker-strain/" className="text-accent dark:text-accent-light hover:underline">
              Dividende de la broker străin: creditul fiscal pe țări
            </Link>
          </li>
          <li>
            <Link to="/ghid/cass-investitii/" className="text-accent dark:text-accent-light hover:underline">
              CASS pe investiții: praguri și exemple
            </Link>
          </li>
        </ul>
      </Section>

      <Section title="De ce totalul nostru diferă de Realized P/L din IBKR">
        <p>
          Extrasul IBKR afișează un total Realized P/L calculat pe metoda <strong>FIFO</strong> (primul cumpărat, primul
          vândut). InvesTax recalculează din tranzacțiile brute pe metoda <strong>Costului Mediu Ponderat (CMP)</strong>.
          De aceea cele două totaluri pot diferi puțin, mai ales dacă ai cumpărat același instrument la prețuri diferite
          și ai vândut parțial.
        </p>
        <p className="mt-3">
          Ambele metode sunt acceptate în practica retail; important este să aplici una consistent pe toate vânzările.
          Logica detaliată este în{' '}
          <Link to="/ghid/cum-calculam/" className="text-accent dark:text-accent-light underline">
            ghidul de metodologie
          </Link>
          .
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Exporți Flex Query în loc de Activity Statement.</strong> Flex Query are alt layout (XML/text, câmpuri
          în camelCase) și nu este citit corect. Scoți Activity Statement în CSV.
        </Mistake>
        <Mistake>
          <strong>Crezi că IBKR reține impozitul pentru ANAF.</strong> Nu reține. Pe câștiguri tu calculezi și declari
          totul. Pe dividende se reține în țara sursă, dar tot tu treci suma și creditul în declarație.
        </Mistake>
        <Mistake>
          <strong>Aștepți un formular fiscal românesc de la IBKR.</strong> IBKR emite documente pentru SUA (de exemplu
          1042-S pe reținerea la dividende), nu un formular pentru ANAF. Pentru D212 folosești Activity Statement-ul.
        </Mistake>
        <Mistake>
          <strong>Confuzia IBKR cu XTB.</strong> XTB are sucursală în România și reține impozitul la sursă (în 2025:
          1% pentru deținere peste 365 de zile și 3% pentru sub; din 2026 cotele cresc la 3%, respectiv 6%). Pentru
          XTB nu mai declari câștigul. Pentru IBKR da. Regimuri complet diferite.
        </Mistake>
        <Mistake>
          <strong>Compari direct cu Realized P/L din IBKR.</strong> IBKR folosește FIFO, InvesTax CMP. O mică diferență
          este normală și nu înseamnă că vreun calcul e greșit.
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Sau folosește calculatorul</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Dacă pașii ăștia ți se par prea mult de lucru, InvesTax aplică automat metoda CMP, cursurile BNR și pragurile
              CASS. Calculatorul manual gratuit funcționează cu cifrele tale brute; pentru încărcarea automată a
              extrasului IBKR (beta) ai nevoie de un plan plătit.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/calculator/" className="btn-secondary inline-flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator gratuit (manual)
              </Link>
              <Link to="/pricing/" className="btn-primary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Încarcă extrasul IBKR (beta)
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="my-12">
        <EmailCapture
          topic="broker_ibkr"
          variant="broker"
          source="ghid-ibkr"
          heading="Te anunțăm când IBKR iese din beta"
          description="Lasă-ți emailul și îți scriem când suportul IBKR e validat pe extrase reale. Ai un Activity Statement? Trimite-ni-l anonimizat și grăbești validarea."
        />
      </section>

      <Section title="Întrebări frecvente">
        <div className="space-y-5">
          {FAQS.map((f, i) => (
            <div key={i}>
              <h3 className="font-semibold mb-1">{f.q}</h3>
              <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      <GhidRelatedGuides currentPath="/ghid/declaratie-unica-ibkr/" />

      <nav className="mt-12">
        <Link
          to="/ghid/"
          className="flex items-center gap-1 text-sm text-accent dark:text-accent-light hover:underline transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Toate ghidurile
        </Link>
      </nav>

      <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-navy-700 text-sm text-gray-500 dark:text-slate-400">
        <p>
          Acest ghid este informativ și acoperă regulile pentru anul fiscal 2025. Suportul IBKR este în beta: verifică
          cifrele față de extrasul tău înainte de depunere. Dacă ai venituri complexe sau dubii, consultă un contabil.
          ANAF publică ghidul oficial al Declarației Unice în fiecare an pe anaf.ro.
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="text-base text-gray-700 dark:text-slate-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Mistake({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3">
      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-base text-gray-700 dark:text-slate-300 leading-relaxed">{children}</p>
    </div>
  );
}
