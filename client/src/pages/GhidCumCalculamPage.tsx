import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, FileText, Calculator } from 'lucide-react';
import {
  GHID_CUM_CALCULAM_FAQS as FAQS,
  GHID_CUM_CALCULAM_ARTICLE_SCHEMA as articleSchema,
  GHID_CUM_CALCULAM_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidCumCalculamSchemas';
import GhidRelatedGuides from '../components/common/GhidRelatedGuides';

export default function GhidCumCalculamPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Cum calculează InvesTax: metodologia explicată | InvesTax</title>
        <meta
          name="description"
          content="Metodologia InvesTax pas cu pas: CMP pentru câștiguri de capital, BNR per-data sau anual (după regulă), credit fiscal pe dividende, CASS pe praguri, raportare pierderi. Cu citate exacte din Codul Fiscal."
        />
        <link rel="canonical" href="https://investax.app/ghid/cum-calculam/" />
        <meta property="og:title" content="Cum calculează InvesTax: metodologia explicată" />
        <meta
          property="og:description"
          content="CMP, BNR, credit pe dividende, CASS, pierderi. Citate exacte din Codul Fiscal. Pentru investitorii care vor să verifice ce face engine-ul înainte să plătească."
        />
        <meta property="og:url" content="https://investax.app/ghid/cum-calculam/" />
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
          Cum calculează InvesTax: metodologia explicată
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Documentăm exact ce face engine-ul, ce articole din Codul Fiscal aplicăm și unde simplificăm. Citește-o
          înainte să plătești.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <ul className="list-disc list-outside pl-6 space-y-1 text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          <li>
            <strong>Cost de bază:</strong> Cost Mediu Ponderat (CMP), nu FIFO. Permis pentru brokeri fără reprezentanță
            în RO (Codul Fiscal art. 94 + Norma 18/2023).
          </li>
          <li>
            <strong>Curs BNR pe dividende:</strong> cursul mediu anual BNR pentru anul fiscal respectiv (art. 131
            alin. 6).
          </li>
          <li>
            <strong>Curs BNR pe câștiguri de capital:</strong> atât fluxul CSV cât și fluxul PDF folosesc cursul BNR
            la data fiecărei tranzacții (art. 96).
          </li>
          <li>
            <strong>Credit fiscal pe dividende:</strong> max(0, 10% × brut RON minus reținere străină RON), limitat la
            impozitul RO (art. 131).
          </li>
          <li>
            <strong>CASS:</strong> praguri 6 / 12 / 24 salarii minime pe veniturile non-salariale cumulate (art. 170).
          </li>
          <li>
            <strong>Pierderi:</strong> report 5 ani, max 70% din câștigurile viitoare, per țară (art. 119).
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <Link
            to="/pricing"
            className="text-accent dark:text-accent-light font-medium underline hover:no-underline"
          >
            Vezi planuri și încarcă PDF-ul Trading212 →
          </Link>
        </p>
      </section>

      <Section title="1. Cost de bază: Costul Mediu Ponderat (CMP)">
        <p>
          Câștigul impozabil pe transferul titlurilor de valoare = preț de vânzare minus baza de cost. Baza de cost se
          poate calcula prin două metode: <strong>FIFO</strong> (cel mai vechi cumpărat este primul vândut) sau{' '}
          <strong>Cost Mediu Ponderat (CMP)</strong> (media ponderată a prețurilor de achiziție pentru fiecare
          instrument). Pentru brokeri fără reprezentanță fiscală în România, Codul Fiscal art. 94 împreună cu Norma
          18/2023 acceptă ambele metode. Regula importantă: alegi o metodă și o aplici consistent pe toate vânzările
          unui instrument.
        </p>
        <p className="mt-3">
          InvesTax folosește CMP. Motivul este pragmatic: extrasele fiscale anuale Trading212 raportează deja câștigul
          calculat prin metoda agregată pe instrument, iar CMP se aplică natural pe poziții deschise în mai multe
          tranșe. Concurența retail (Finoro) folosește FIFO; în practică, pentru retail buy-and-hold rezultatul diferă
          puțin (diferența contează la traderi activi cu multe tranșe parțial vândute).
        </p>
        <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
          <p className="font-semibold mb-2">Exemplu CMP:</p>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>15 ianuarie 2025: cumperi 10 acțiuni AAPL la 180 USD = 1.800 USD</li>
            <li>10 martie 2025: cumperi 5 acțiuni AAPL la 220 USD = 1.100 USD</li>
            <li>Total: 15 acțiuni, cost total 2.900 USD</li>
            <li>Cost mediu ponderat per acțiune: 2.900 / 15 ≈ 193,33 USD</li>
            <li>20 mai 2025: vinzi 8 acțiuni la 240 USD = 1.920 USD</li>
            <li>Câștig în USD: 1.920 minus (8 × 193,33) = 1.920 minus 1.546,67 ≈ 373,33 USD</li>
          </ul>
          <p className="mt-2 italic">
            Cele 7 acțiuni rămase păstrează costul mediu de 193,33 USD pentru următoarea vânzare. Pentru declarație,
            câștigul în USD se convertește în RON (vezi secțiunea următoare).
          </p>
        </div>
      </Section>

      <Section title="2. Conversia în RON folosind cursurile BNR">
        <p>
          Codul Fiscal aplică reguli BNR distincte în funcție de categoria venitului. InvesTax respectă această
          separare:
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">2.1. Pentru dividende: cursul mediu anual BNR</h3>
        <p>
          Pentru dividendele primite în valută străină, conversia în RON se face la <strong>cursul mediu anual BNR al
          pieței valutare, comunicat pentru anul în care s-a realizat venitul</strong> (Codul Fiscal art. 131 alin. 6).
          De exemplu, dividende în USD primite în 2025 se convertesc la cursul mediu BNR USD/RON pentru 2025 (4,4705
          RON/USD), nu la cursul din ziua plății și nici la cursul brokerului. Această regulă este universală pentru
          dividende, indiferent de broker sau țară emitentă.
        </p>

        <h3 className="text-lg font-semibold mt-5 mb-2">2.2. Pentru câștiguri de capital: cursul BNR la data tranzacției</h3>
        <p>
          Pentru câștigurile din transferul titlurilor de valoare, regula strictă este cursul BNR valabil la data
          fiecărei tranzacții (Codul Fiscal art. 96). Astfel, costul de achiziție și prețul de vânzare se convertesc
          fiecare la cursul BNR din ziua respectivă, iar câștigul în RON este diferența celor două sume convertite.
        </p>
        <div className="my-4 p-4 bg-slate-500/5 dark:bg-slate-500/10 border-l-4 border-slate-400 rounded-r-xl text-sm">
          <p className="font-semibold mb-2">Ambele fluxuri aplică aceeași regulă</p>
          <ul className="list-disc list-outside pl-5 space-y-1.5">
            <li>
              <strong>Fluxul CSV și fluxul PDF</strong> aplică cursul BNR per-tranzacție pentru câștigurile de capital,
              conform regulii stricte (art. 96). Dividendele rămân la cursul mediu anual (art. 131 alin. 6).
            </li>
            <li>
              <strong>Notă istorică:</strong> declarația fondatorului InvesTax pentru anul 2025 a fost depusă la ANAF
              prin SPV folosind cursul mediu anual și pentru câștigurile de capital (total 28.053 lei, 10 aprilie 2026),
              o simplificare uzuală acceptată la acel moment. Acea depunere rămâne valabilă așa cum a fost depusă; nu
              mai reflectă metoda curentă a InvesTax.
            </li>
          </ul>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
          Sursa cursurilor BNR: bnr.ro, secțiunea „Cursul de schimb mediu anual" pentru ratele anuale și „Arhiva
          cursului oficial" pentru cursurile zilnice. InvesTax folosește un cache intern al cursurilor zilnice BNR
          pentru anul fiscal curent, actualizat zilnic.
        </p>
      </Section>

      <Section title="3. Impozit 10% pe câștigul net anual">
        <p>
          Câștigul net anual din transferul titlurilor de valoare (vânzări minus baza de cost CMP, toate convertite în
          RON) se impozitează cu 10% (Codul Fiscal art. 96 + 97 + 119). Pentru anul fiscal 2025, cota este 10%. Pentru
          anul fiscal 2026 și ulteriori, cota se modifică la 16% conform Legii 239/2025. InvesTax va fi actualizat
          înainte de sezonul de depunere 2027.
        </p>
        <p>
          Câștigul net se calculează agregat pe an, nu per tranzacție: dacă ai câștiguri din unele vânzări și pierderi
          din altele, se compensează între ele în cadrul aceluiași an înainte de aplicarea cotei.
        </p>
      </Section>

      <Section title="4. Dividende: 10% RO cu credit pentru reținerea străină">
        <p>
          Pentru dividendele de la brokeri fără reprezentanță fiscală în România, InvesTax aplică formula:
        </p>
        <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
          <p className="font-medium mb-2">Formula:</p>
          <p>Impozit final RO = max(0, 10% × dividend brut RON minus reținere străină în RON)</p>
        </div>
        <p>
          Creditul pentru reținerea străină este limitat la impozitul român (10% pentru 2025) conform Codul Fiscal art.
          131. Dacă reținerea străină depășește 10% (de exemplu 30% în SUA fără W-8BEN, 15% în Olanda, 26,375% în
          Germania), diferența nu se recuperează în România. Pentru detalii pe țară, exemple lucrate și tratatele de
          evitare a dublei impuneri, vezi{' '}
          <a className="text-accent dark:text-accent-light underline hover:no-underline" href="/ghid/dividende-broker-strain">
            ghidul dividendelor de la broker străin
          </a>
          .
        </p>
      </Section>

      <Section title="5. CASS pe veniturile non-salariale">
        <p>
          CASS (contribuția de asigurări sociale de sănătate) se aplică pe totalul veniturilor non-salariale cumulate,
          conform Codul Fiscal art. 170. Pragurile pentru anul fiscal 2025 (cu salariul minim 4.050 RON/lună, HG
          1506/2024):
        </p>
        <div className="my-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-accent">
                <th className="text-left py-2 pr-4 font-semibold">Prag</th>
                <th className="text-left py-2 pr-4 font-semibold">Venit total non-salarial</th>
                <th className="text-left py-2 font-semibold">CASS de plată</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              <tr>
                <td className="py-2 pr-4">sub 6 salarii minime</td>
                <td className="py-2 pr-4">sub 24.300 RON</td>
                <td className="py-2">0 RON (sub plafon)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">6 salarii minime</td>
                <td className="py-2 pr-4">24.300 RON</td>
                <td className="py-2">2.430 RON</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">12 salarii minime</td>
                <td className="py-2 pr-4">48.600 RON</td>
                <td className="py-2">4.860 RON</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">24 salarii minime</td>
                <td className="py-2 pr-4">97.200 RON</td>
                <td className="py-2">9.720 RON</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Veniturile care intră în calculul pragului: câștiguri din transferul titlurilor de valoare, dividende
          (brut), dobânzi, chirii, alte venituri ale persoanei fizice. InvesTax cumulează automat veniturile pe care
          le declari și determină pragul corect. Detalii și exemple în{' '}
          <a className="text-accent dark:text-accent-light underline hover:no-underline" href="/ghid/cass-investitii">
            ghidul CASS pe investiții
          </a>
          .
        </p>
      </Section>

      <Section title="6. Raportarea pierderilor">
        <p>
          Pierderea netă anuală din transferul titlurilor de valoare prin brokeri fără reprezentanță în România se
          reportează 5 ani fiscali consecutivi, în limita a 70% din câștigurile nete viitoare (Codul Fiscal art. 119).
          Pentru pierderi din străinătate, compensarea se face cu câștiguri de aceeași natură și sursă, pentru fiecare
          țară în parte.
        </p>
        <p>
          InvesTax aplică reportul automat atunci când încarci extrase consecutive pentru același cont. Pentru anii
          anteriori, InvesTax folosește valorile pierderilor reportate pe care le treci în formularul de cont.
        </p>
      </Section>

      <Section title="7. Ce extragem efectiv din extras">
        <p>
          Pentru fluxul PDF Trading212, parser-ul extrage din extrasul fiscal anual următoarele secțiuni:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Sell trades:</strong> data execuției, cantitate, valoare brută în valută, valută. Necesare pentru
            câștigul realizat.
          </li>
          <li>
            <strong>Buy trades:</strong> data, cantitate, preț, valoare. Folosite pentru calculul bazei de cost CMP.
          </li>
          <li>
            <strong>Dividends:</strong> data plății, instrument (ISIN), valoare brută, reținere străină. Necesare
            pentru creditul fiscal.
          </li>
          <li>
            <strong>Distributions:</strong> pentru ETF-uri cu distribuție, tratate similar dividendelor.
          </li>
          <li>
            <strong>Interest:</strong> dobânzi de la conturi de cash (T212 Pies / Interest on Cash). Intră în
            veniturile non-salariale pentru calculul CASS.
          </li>
        </ul>
        <p className="mt-3">
          Secțiunea <strong>Overview</strong> a brokerului (rezumatul anual) este folosită ca verificare independentă.
          Dacă suma tranzacțiilor extrase nu se potrivește cu Overview (diferență de semn sau diferență de magnitudine
          peste 10x), parser-ul afișează un <strong>avertisment vizibil înainte de plată</strong> și blochează
          exportul D212 până la rezolvare. Această verificare a fost introdusă după două bug-uri reale de parser
          raportate de primii clienți plătitori.
        </p>
      </Section>

      <Section title="8. Ce NU calculează InvesTax">
        <p>Transparența limitărilor este parte din metodologie. Lista curentă:</p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>FIFO.</strong> Folosim doar CMP (vezi secțiunea 1). Dacă ai nevoie de declarație pe FIFO,
            instrumentul nu se potrivește.
          </li>
          <li>
            <strong>Stock splits în fluxul CSV.</strong> CSV-ul Trading212 nu marchează split-urile (NVDA 10:1, TSLA
            3:1). Pentru anii cu split-uri, recomandăm explicit fluxul PDF, care raportează tranzacțiile post-split
            consistent.
          </li>
          <li>
            <strong>Crypto.</strong> Veniturile din crypto au regim fiscal distinct (Codul Fiscal art. 116, cursul BNR
            per-tranzacție). Modul separat este în roadmap, nu este inclus în calculul curent.
          </li>
          <li>
            <strong>Brokeri români cu reprezentanță fiscală în România.</strong> Tradeville, XTB Romania, Banca
            Transilvania Capital Partners etc. rețin impozitul direct la sursă (cota 1% sau 3% pentru anul fiscal
            2025, conform XTB Romania). Pentru aceștia nu este nevoie să declari prin D212; InvesTax acoperă explicit
            brokerii fără reprezentanță fiscală în RO.
          </li>
          <li>
            <strong>Recuperarea reținerii străine de peste 10%.</strong> Dacă în SUA s-au reținut 30% (fără W-8BEN),
            diferența de 20% peste creditul RO nu se recuperează în România. Recuperarea trebuie făcută la fiscul
            străin, proces separat.
          </li>
        </ul>
      </Section>

      <Section title="9. Avertismente și verificări automate">
        <p>
          InvesTax aplică mai multe verificări de sănătate pe fiecare extras procesat. Dacă orice verificare
          eșuează, vezi un avertisment vizibil și exportul D212 este blocat până se confirmă cifra cu un contabil sau
          se contactează echipa de suport:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Sign mismatch:</strong> suma tranzacțiilor extrase și valoarea din raportul Overview au semn
            opus (de exemplu, pierderi conform Overview dar câștiguri conform tranzacțiilor).
          </li>
          <li>
            <strong>Magnitude mismatch:</strong> diferența între cele două surse este peste 10x.
          </li>
          <li>
            <strong>Parser warnings:</strong> orice inconsistență detectată în extragerea tabelelor (linii lipsă,
            valori care nu se potrivesc structural).
          </li>
        </ul>
        <p className="mt-3">
          Filozofia este preventivă: preferăm să blocăm un export potențial corect decât să livrăm un număr greșit
          unui plătitor. Dacă vezi un astfel de avertisment, contactează-mă direct și voi analiza extrasul concret.
        </p>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Verifică pe cifrele tale</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Calculatorul manual gratuit aplică aceeași metodologie pe sume introduse de tine. Pentru calcul automat
              direct din PDF-ul Trading212, vezi planurile de plată.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/calculator" className="btn-secondary inline-flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator manual
              </Link>
              <Link to="/pricing" className="btn-primary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Upload PDF (€12 lansare)
              </Link>
            </div>
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

      <GhidRelatedGuides currentPath="/ghid/cum-calculam" />

      <nav className="mt-12">
        <Link
          to="/ghid"
          className="flex items-center gap-1 text-sm text-accent dark:text-accent-light hover:underline transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Toate ghidurile
        </Link>
      </nav>

      <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-navy-700 text-sm text-gray-500 dark:text-slate-400">
        <p>
          Acest ghid documentează metodologia InvesTax pentru anul fiscal 2025 (declarație depusă până la 25 mai
          2026). Articolele citate sunt din Codul Fiscal român (Legea 227/2015 cu modificările ulterioare) și din
          Norma 18/2023. Pentru cazuri complexe consultă un contabil autorizat. ANAF rămâne autoritatea finală
          pentru interpretarea regulilor.
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
