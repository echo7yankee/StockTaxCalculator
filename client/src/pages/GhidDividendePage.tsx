import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator } from 'lucide-react';
import {
  GHID_DIVIDENDE_FAQS as FAQS,
  GHID_DIVIDENDE_ARTICLE_SCHEMA as articleSchema,
  GHID_DIVIDENDE_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidDividendeSchemas';

export default function GhidDividendePage() {
  const navigate = useNavigate();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Dividende de la broker străin în Declarația Unică 2026 | InvesTax</title>
        <meta
          name="description"
          content="Cum declari dividendele primite de la Trading212, Revolut, IBKR, eToro: rata în RO, creditul pentru reținerea străină, ratele pe țară (SUA, UK, IE, NL), exemple, FAQ."
        />
        <link rel="canonical" href="https://investax.app/ghid/dividende-broker-strain" />
        <meta property="og:title" content="Dividende de la broker străin în Declarația Unică 2026" />
        <meta
          property="og:description"
          content="Reținerea străină, creditul fiscal, ratele pe țară, exemple lucrate. Pentru investitorii cu Trading212, Revolut, IBKR, eToro."
        />
        <meta property="og:url" content="https://investax.app/ghid/dividende-broker-strain" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-accent dark:hover:text-accent-light mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Acasă
      </button>

      <header className="mb-10">
        <p className="text-sm text-accent dark:text-accent-light font-medium mb-2">Ghid</p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
          Dividende de la broker străin în Declarația Unică 2026
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Cum declari corect dividendele primite de la Trading212, Revolut, IBKR, eToro și alte platforme fără
          reprezentanță în România. Cu credit fiscal pentru reținerea străină, rate pe țară și exemple.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Dividendele primite de la brokeri fără reprezentanță fiscală în România (Trading212, Revolut, IBKR, eToro)
          se declară în D212 la rubrica „Venituri din dividende din străinătate". Datorezi 10% pe dividend brut, în RON
          la cursul BNR din ziua primirii. Primești credit pentru reținerea străină, limitat la impozitul român.
          Ratele pe țară diferă: 10% (SUA cu W-8BEN), 0% (Marea Britanie), 15% (Germania, Olanda) etc.
        </p>
      </section>

      <Section title="Cum funcționează creditul pentru dublă impunere">
        <p>
          Mecanica e simplă în principiu: brokerul reține impozit la sursă, în țara emitentului, conform tratatului
          fiscal sau legii locale. Tu plătești 10% în România pe brut, dar primești credit egal cu reținerea străină,
          limitat la impozitul român. Practic:
        </p>
        <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
          <p className="font-medium mb-2">Formula:</p>
          <p>
            Impozit final RO = max(0, 10% × dividend brut RON − reținere străină în RON)
          </p>
        </div>
        <p>
          Două situații extreme:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Reținere străină ≥ 10%</strong> (SUA cu W-8BEN, Olanda, Germania): impozit final RO = 0. Dar tot
            declari și treci creditul.
          </li>
          <li>
            <strong>Reținere străină &lt; 10%</strong> (Marea Britanie 0%, Irlanda 0% pentru ETF-uri UCITS): plătești
            diferența până la 10% din brut.
          </li>
          <li>
            <strong>Reținere străină &gt; 10%</strong> (SUA fără W-8BEN, 30%): creditul tău e limitat la 10% din brut
            (cât ar fi fost impozitul RO). Diferența peste e pierdută. Plătești 0 în RO, dar pierzi 20% care nu se
            recuperează.
          </li>
        </ul>
      </Section>

      <Section title="Ratele de reținere pe țară (pentru rezidenți fiscali RO)">
        <p>
          Tabelul de mai jos sintetizează ratele uzuale aplicate pentru investitorii români persoane fizice. Verifică
          tratatul exact pe site-ul ANAF sau cu contabilul, mai ales pentru jurisdicții mai puțin frecvente.
        </p>
        <div className="my-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-accent">
                <th className="text-left py-2 pr-4 font-semibold">Țara emitentului</th>
                <th className="text-left py-2 pr-4 font-semibold">Reținere standard</th>
                <th className="text-left py-2 pr-4 font-semibold">Cu tratat / W-8BEN</th>
                <th className="text-left py-2 font-semibold">Mai plătești în RO?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              <tr>
                <td className="py-2 pr-4">SUA</td>
                <td className="py-2 pr-4">30%</td>
                <td className="py-2 pr-4">10% (cu W-8BEN)</td>
                <td className="py-2">0 (credit complet)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Marea Britanie</td>
                <td className="py-2 pr-4">0%</td>
                <td className="py-2 pr-4">0%</td>
                <td className="py-2">10% pe brut</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Irlanda (ETF-uri UCITS)</td>
                <td className="py-2 pr-4">0% pentru non-rezidenți</td>
                <td className="py-2 pr-4">0%</td>
                <td className="py-2">10% pe brut</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Germania</td>
                <td className="py-2 pr-4">26,375%</td>
                <td className="py-2 pr-4">15% (tratat)</td>
                <td className="py-2">0 (credit complet)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Olanda</td>
                <td className="py-2 pr-4">15%</td>
                <td className="py-2 pr-4">15%</td>
                <td className="py-2">0 (credit complet)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Franța</td>
                <td className="py-2 pr-4">25%</td>
                <td className="py-2 pr-4">10% (tratat)</td>
                <td className="py-2">0 (credit complet)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Spania</td>
                <td className="py-2 pr-4">19%</td>
                <td className="py-2 pr-4">10% (tratat)</td>
                <td className="py-2">0 (credit complet)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Elveția</td>
                <td className="py-2 pr-4">35%</td>
                <td className="py-2 pr-4">10% (tratat, cu cerere recuperare diferență)</td>
                <td className="py-2">0 (credit pe partea de 10%)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-slate-400 italic">
          Pentru SUA, Trading212 și Revolut gestionează W-8BEN automat la deschiderea contului. Pentru alte țări,
          ratele aplicate sunt cele standard sau de tratat, în funcție de procedurile interne ale brokerului. Pe
          extrasul fiscal vezi exact ce ți s-a reținut.
        </p>
      </Section>

      <Section title="Pașii pentru declarație">
        <Step number={1} title="Adună datele despre dividende din extrasul broker">
          <p>
            Pe extrasul fiscal anual al brokerului ai pentru fiecare dividend: data plății, suma brută în valuta
            originală, reținerea străină, suma netă primită. Suma de care te interesezi este BRUTUL.
          </p>
        </Step>

        <Step number={2} title="Convertește fiecare dividend la cursul BNR din ziua plății">
          <p>
            Cursul BNR oficial din ziua plății (settlement date), nu cursul brokerului și nu un curs mediu. Sursă:
            bnr.ro sau cursbnr.ro pentru istoric rapid.
          </p>
        </Step>

        <Step number={3} title="Calculează impozitul român pe brut">
          <p>
            Impozit RO = 10% × suma brut RON. Asta este obligația teoretică, înainte de credit.
          </p>
        </Step>

        <Step number={4} title="Aplică creditul pentru reținerea străină">
          <p>
            Reținerea străină în RON (la același curs BNR ca pentru brut) reduce impozitul român până la limita
            acestuia. Dacă reținerea străină e ≥ impozit RO, plătești 0 în RO.
          </p>
        </Step>

        <Step number={5} title="Treci în D212">
          <p>
            La rubrica „Venituri din dividende din străinătate" treci suma brută totală în RON și suma totală a
            reținerii străine. Sistemul ANAF face calculul final.
          </p>
        </Step>
      </Section>

      <Section title="Exemple lucrate">
        <Example title="Exemplul 1: AAPL (SUA, cu W-8BEN)">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Dividend brut: 100 USD</li>
            <li>Curs BNR ziua plății: 4,50 RON/USD</li>
            <li>Brut RON: 450 RON</li>
            <li>Reținut SUA (10% cu W-8BEN): 10 USD = 45 RON</li>
            <li>Impozit RO datorat: 10% × 450 = 45 RON</li>
            <li>Credit reținere străină: 45 RON</li>
            <li><strong>De plătit ANAF: 0 RON</strong></li>
          </ul>
        </Example>

        <Example title="Exemplul 2: Vodafone (Marea Britanie)">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Dividend brut: 50 GBP</li>
            <li>Curs BNR ziua plății: 5,80 RON/GBP</li>
            <li>Brut RON: 290 RON</li>
            <li>Reținut UK: 0 GBP = 0 RON</li>
            <li>Impozit RO datorat: 10% × 290 = 29 RON</li>
            <li>Credit reținere străină: 0 RON</li>
            <li><strong>De plătit ANAF: 29 RON</strong></li>
          </ul>
          <p className="mt-2 text-sm italic">
            UK nu reține pe dividendele plătite către non-rezidenți, deci plătești 10% complet în RO.
          </p>
        </Example>

        <Example title="Exemplul 3: SHEL (Olanda)">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Dividend brut: 80 EUR</li>
            <li>Curs BNR ziua plății: 5,00 RON/EUR</li>
            <li>Brut RON: 400 RON</li>
            <li>Reținut NL (15%): 12 EUR = 60 RON</li>
            <li>Impozit RO datorat: 10% × 400 = 40 RON</li>
            <li>Credit reținere străină: 40 RON (limitat la impozitul RO)</li>
            <li><strong>De plătit ANAF: 0 RON</strong></li>
          </ul>
          <p className="mt-2 text-sm italic">
            Reținerea NL e mai mare decât impozitul RO, deci diferența nu se recuperează aici. Pentru recuperare ai
            putea să faci cerere la fiscul olandez, dar e proces complicat și de regulă nu se merită pentru sume
            mici.
          </p>
        </Example>

        <Example title="Exemplul 4: ETF VWCE (Irlanda, accumulating)">
          <p className="mt-2">
            VWCE este ETF de acumulare (UCITS irlandez). NU plătește dividende către investitori. Veniturile sunt
            reinvestite intern. La tine nu apare nicio plată de dividend pe extras. <strong>Nimic de declarat la
            rubrica dividende.</strong>
          </p>
          <p className="mt-2">
            Dividendele „interne" (cele pe care le primește fondul de la companii) sunt impozitate la nivelul
            fondului și nu îți generează obligații fiscale separate. Vezi și ghidul Trading212 pentru declararea
            câștigului la vânzare.
          </p>
        </Example>
      </Section>

      <Section title="Documente pentru ANAF">
        <p>
          Dacă vrei să aplici creditul fiscal, ai nevoie de un document oficial care atestă reținerea străină. ANAF
          poate cere dovada în cazul unei verificări:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>SUA:</strong> formularul 1042-S de la IRS (emis de broker / custodian) sau certificatul de
            reținere de la broker. Trading212 și Revolut îl pun la dispoziție în documente.
          </li>
          <li>
            <strong>Alte țări:</strong> certificatul de reținere de la broker (consolidated tax statement). Conține
            suma plăților, reținerea pe fiecare plată și ratele aplicate.
          </li>
          <li>
            <strong>În lipsa documentelor:</strong> ANAF poate refuza creditul. Plătești 10% pe brut fără reducere.
          </li>
        </ul>
        <p className="mt-3">
          Bună practică: salvează toate extrasele anuale într-un folder local. Le reții 5 ani fiscali (termenul de
          prescripție pentru ANAF).
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Folosirea sumei NETE.</strong> Pentru declarație, folosești BRUTUL, nu netul primit în cont. Reținerea
          se trece separat ca credit.
        </Mistake>
        <Mistake>
          <strong>Cursul greșit.</strong> Cursul BNR din ziua plății, nu cursul brokerului și nu cursul mediu anual.
        </Mistake>
        <Mistake>
          <strong>Aplicarea creditului peste impozitul RO.</strong> Reținerea străină de 30% (SUA fără W-8BEN) NU îți
          dă credit de 30%, ci doar până la 10% (limita impozitului român). Diferența nu se recuperează în RO.
        </Mistake>
        <Mistake>
          <strong>Confundarea ETF-urilor de acumulare cu cele cu distribuție.</strong> Doar ETF-urile distribuibile
          plătesc dividende. ETF-urile cu acumulare (VWCE, CSPX, EUNL, IWDA) nu generează dividende declarabile.
        </Mistake>
        <Mistake>
          <strong>Omiterea dividendelor mici.</strong> Indiferent de sumă, toate dividendele primite în 2025 se
          declară. Lipsa unei plăți poate fi semnalată de ANAF prin schimbul automat de informații (CRS / DAC).
        </Mistake>
        <Mistake>
          <strong>Ignorarea CASS.</strong> Dividendele intră în calculul pragului CASS, alături de celelalte venituri
          non-salariale. Vezi{' '}
          <a className="text-accent dark:text-accent-light underline hover:no-underline" href="/ghid/cass-investitii">
            ghidul CASS
          </a>
          .
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Calculează automat</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              InvesTax aplică creditul pentru reținerea străină automat dacă încarci raportul fiscal anual de la
              Trading212. Vezi cifrele finale gata de copiat în D212, în RON, cu cursurile BNR și ratele pe țară deja
              aplicate.
            </p>
            <button onClick={() => navigate('/calculator')} className="btn-primary inline-flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Deschide calculatorul
            </button>
          </div>
        </div>
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

      <nav className="mt-12">
        <button
          onClick={() => navigate('/ghid')}
          className="flex items-center gap-1 text-sm text-accent dark:text-accent-light hover:underline transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Toate ghidurile
        </button>
      </nav>

      <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-navy-700 text-sm text-gray-500 dark:text-slate-400">
        <p>
          Acest ghid este informativ și se aplică pentru anul fiscal 2025 (depus în 2026). Tratatele de evitare a
          dublei impuneri se actualizează ocazional. Pentru jurisdicții mai puțin frecvente, verifică tratatul exact
          pe anaf.ro sau consultă un contabil.
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

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white text-sm font-bold flex-shrink-0">
          {number}
        </span>
        {title}
      </h3>
      <div className="text-base text-gray-700 dark:text-slate-300 leading-relaxed pl-11">{children}</div>
    </div>
  );
}

function Example({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
      <p className="font-semibold mb-1">{title}</p>
      <div>{children}</div>
    </div>
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
