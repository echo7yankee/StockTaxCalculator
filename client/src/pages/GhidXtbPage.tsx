import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Building2, Calculator, FileText, ShieldAlert, CheckCircle2 } from 'lucide-react';
import {
  GHID_XTB_FAQS as FAQS,
  GHID_XTB_ARTICLE_SCHEMA as articleSchema,
  GHID_XTB_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidXtbSchemas';
import GhidRelatedGuides from '../components/common/GhidRelatedGuides';

// Page is scoped to tax year 2025 (the active filing year), matching the rest of
// the /ghid cluster. The 2026 rate increases are referenced qualitatively ("din
// 2026") per the ghid convention; no bare "16%" appears here (guarded by the
// prerender test), since the engine is 2025-only until backlog #13 PR C flips it.
//
// LOAD-BEARING tax nuance (verified via the tax-fact gate, art. 96^1 / 97 / 123 /
// 131 Cod fiscal): XTB withholds the capital-gains income tax at source (impozit
// final), so the investor does NOT self-declare those gains FOR INCOME TAX. BUT
// the same gains still count toward the CASS plafon, so an XTB-only investor over
// 24.300 lei (2025) still files the Declarația Unică FOR CASS. Never state the
// unqualified "no DU for XTB". The "Legea 239/2025 splits the CASS base by
// intermediary type" hypothesis is unverified and must not appear.
export default function GhidXtbPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Impozit XTB România: ce declari în Declarația Unică | InvesTax</title>
        <meta
          name="description"
          content="XTB are sucursală în România și reține impozitul pe câștiguri la sursă, deci nu depui Declarația Unică pentru impozitul pe ele. Ce îți rămâne totuși de declarat: dividende din străinătate și CASS. Diferența față de Trading212, Revolut și IBKR."
        />
        <link rel="canonical" href="https://investax.app/ghid/impozit-xtb/" />
        <meta property="og:title" content="Impozit pe investiții la XTB: ce declari și ce nu" />
        <meta
          property="og:description"
          content="XTB reține impozitul pe câștiguri la sursă (1%/3% în 2025), deci nu depui Declarația Unică pentru impozitul pe ele. Ce rămâne de declarat și cum diferă de brokerii străini."
        />
        <meta property="og:url" content="https://investax.app/ghid/impozit-xtb/" />
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
          Impozit pe investiții la XTB: ce declari și ce nu
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          XTB nu se declară ca Trading212, Revolut sau Interactive Brokers. Are sucursală în România și reține impozitul
          pe câștiguri direct la sursă, așa că pentru impozitul pe acele câștiguri nu mai depui Declarația Unică. Iată ce
          înseamnă asta și ce îți rămâne totuși de făcut.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-accent dark:text-accent-light flex-shrink-0" />
          Pe scurt
        </h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Pentru câștigurile din vânzarea acțiunilor prin XTB <strong>nu depui Declarația Unică pentru impozitul pe
          câștig</strong>: brokerul reține impozitul la sursă, la fiecare tranzacție (în 2025: <strong>1%</strong> pentru
          deținere peste 365 de zile și <strong>3%</strong> pentru sub; din 2026 cresc la 3%, respectiv 6%), iar acesta
          este impozit final. Există însă o excepție pentru <strong>CASS</strong>: aceste câștiguri se iau în calcul la
          plafoanele de 6, 12 și 24 de salarii minime. Dacă totalul veniturilor tale din investiții trece de{' '}
          <strong>24.300 de lei</strong> (în 2025), tot depui Declarația Unică, dar doar pentru CASS. Îți rămân de
          declarat și <strong>dividendele din acțiuni străine</strong>. Iar dacă pe lângă XTB ai un broker străin
          (Trading212, Revolut, IBKR), pentru acela <strong>tu</strong> declari câștigul.
        </p>
      </section>

      <Section title="De ce XTB e diferit de Trading212, Revolut și IBKR">
        <p>
          Diferența nu ține de tehnologie, ci de unde este înregistrat brokerul. XTB operează în România prin sucursala
          locală a <strong>XTB S.A. (Polonia)</strong>, asimilată unui sediu permanent, deci este un{' '}
          <strong>intermediar rezident</strong>. Pentru un astfel de intermediar, legea îi cere să rețină impozitul pe
          câștiguri și să îl vireze el către stat, în numele tău (Codul Fiscal art. 96^1 și art. 97).
        </p>
        <p>
          Trading212, Revolut și Interactive Brokers sunt, în schimb, <strong>brokeri străini fără sediu permanent în
          România</strong>. Ei nu rețin nimic pentru ANAF, așa că obligația de a calcula și declara câștigul cade pe
          tine: completezi Declarația Unică și plătești <strong>10% pe câștigul net anual pentru 2025</strong> (cotă care
          crește din 2026, conform Legii 239/2025, Codul Fiscal art. 123). Confuzia dintre cele două regimuri este cea
          mai frecventă greșeală a investitorilor care folosesc mai mulți brokeri.
        </p>
        <div className="my-4 grid gap-3 sm:grid-cols-2">
          <div className="p-4 rounded-xl border border-accent/30 bg-accent/5 dark:bg-accent/10">
            <p className="font-semibold text-sm mb-1 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-accent dark:text-accent-light" /> XTB (sucursală în România)
            </p>
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Reține impozitul la sursă. Pentru impozitul pe câștig <strong>nu</strong> depui Declarația Unică (rămâne
              partea de CASS).
            </p>
          </div>
          <div className="p-4 rounded-xl border border-gray-200 dark:border-navy-700">
            <p className="font-semibold text-sm mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500 dark:text-slate-400" /> Trading212 / Revolut / IBKR
            </p>
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Brokeri străini. <strong>Tu</strong> declari câștigul net anual în Declarația Unică.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Ce reține XTB, mai exact">
        <p>
          Impozitul pe câștigurile din transferul titlurilor de valoare printr-un intermediar rezident se reține
          <strong> diferențiat în funcție de perioada de deținere</strong>:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Pentru 2025:</strong> 1% dacă ai deținut instrumentul <strong>peste 365 de zile</strong> și 3% dacă
            l-ai deținut <strong>sub 365 de zile</strong>.
          </li>
          <li>
            <strong>Din 2026:</strong> cotele cresc la 3%, respectiv 6% (Legea 239/2025).
          </li>
        </ul>
        <p className="mt-3">
          Impozitul este reținut și virat de XTB la fiecare tranzacție, deci pentru aceste câștiguri este{' '}
          <strong>final</strong> (art. 97 din Codul Fiscal): nu le mai recalculezi și nu le mai treci în Declarația Unică
          pentru impozitul pe câștig. Spre deosebire de brokerii străini, unde impozitarea se face pe{' '}
          <em>câștigul net anual</em> (câștiguri minus pierderi, cumulate pe an), reținerea XTB se aplică pe fiecare
          operațiune în parte. Rămâne însă de verificat partea de CASS, mai jos.
        </p>
      </Section>

      <Section title="Ce îți rămâne de declarat chiar dacă folosești doar XTB">
        <p>
          Reținerea la sursă acoperă <strong>doar impozitul pe câștigurile din vânzarea acțiunilor</strong>. Două lucruri
          pot rămâne în sarcina ta:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Dividendele din acțiuni străine.</strong> Se declară în Declarația Unică, separat de câștiguri,
            pentru că XTB nu reține impozitul român final pe ele. Pentru 2025 cota este 10%, cu <strong>credit
            fiscal</strong> pentru impozitul deja reținut în țara sursă (de exemplu 10% pe dividendele din SUA, cu
            formularul W-8BEN), ca să nu fii impozitat de două ori pe aceeași sumă (art. 131 din Codul Fiscal).
          </li>
          <li>
            <strong>CASS, dacă treci de praguri.</strong> Contribuția la sănătate nu se calculează pe câștig, ci pe{' '}
            <strong>totalul veniturilor tale non-salariale</strong> dintr-un an, comparat cu praguri fixe de 6, 12 și 24
            de salarii minime. Pentru 2025 pragurile sunt <strong>24.300 / 48.600 / 97.200 lei</strong>. Dacă ai
            dividende, câștiguri de la alți brokeri, dobânzi sau chirii care, însumate, trec de primul prag, datorezi
            CASS.
          </li>
        </ul>
        <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <p className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              Chiar dacă impozitul pe câștig este reținut de XTB la sursă, <strong>aceste câștiguri se iau în calcul la
              plafonul de CASS</strong>, alături de dividende, dobânzi și celelalte venituri din investiții. Un cont XTB
              nu te scutește automat de CASS: dacă totalul trece de prag, depui Declarația Unică doar pentru contribuție.
            </span>
          </p>
        </div>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Ai și Trading212, Revolut sau IBKR pe lângă XTB?</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Pentru câștigurile de la brokerii străini declari tu, pe câștigul net anual. Acolo InvesTax îți face
              calculul pentru anul fiscal 2025: metoda costului mediu ponderat, cursurile BNR pe data fiecărei
              tranzacții, cota de dividende și pragurile CASS. Calculatorul manual este gratuit; încărcarea extrasului de
              broker este în planul plătit.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/calculator/" className="btn-secondary inline-flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator gratuit (manual)
              </Link>
              <Link to="/pricing/" className="btn-primary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Încarcă extrasul (anul 2025)
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-10 p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          Ce nu îți poate spune acest ghid
        </h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Nu îți putem evalua situația specifică și nu suntem contabili. InvesTax este un instrument software, nu
          consultanță fiscală personalizată. Dacă ai sume mari, mai multe surse de venit sau o situație neobișnuită,
          discută cu un consultant fiscal sau cu un contabil înainte să depui.
        </p>
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

      <GhidRelatedGuides currentPath="/ghid/impozit-xtb/" />

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
          Acest ghid este informativ și descrie regulile aplicabile veniturilor din investiții pentru anul fiscal 2025.
          Nu reprezintă consultanță fiscală personalizată. ANAF publică ghidurile oficiale ale Declarației Unice pe
          anaf.ro.
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
