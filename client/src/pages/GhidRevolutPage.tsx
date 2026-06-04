import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator, ShieldAlert } from 'lucide-react';
import {
  GHID_REVOLUT_FAQS as FAQS,
  GHID_REVOLUT_ARTICLE_SCHEMA as articleSchema,
  GHID_REVOLUT_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidRevolutSchemas';
import GhidRelatedGuides from '../components/common/GhidRelatedGuides';

export default function GhidRevolutPage() {
  const navigate = useNavigate();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Cum declar Revolut Trading în Declarația Unică 2026 | InvesTax</title>
        <meta
          name="description"
          content="Ghid pentru investitorii Revolut Stocks / Trading: cum declari câștigurile, pierderile și dividendele în Declarația Unică 2026. Pași, exemplu, FAQ. Deadline 25 mai."
        />
        <link rel="canonical" href="https://investax.app/ghid/declaratie-unica-revolut/" />
        <meta property="og:title" content="Cum declar Revolut Trading în Declarația Unică 2026" />
        <meta
          property="og:description"
          content="Ghid pentru investitorii Revolut: pași, exemplu lucrat, greșeli frecvente, FAQ. Deadline 25 mai 2026."
        />
        <meta property="og:url" content="https://investax.app/ghid/declaratie-unica-revolut/" />
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
          Cum declar Revolut Trading în Declarația Unică 2026
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Deadline: 25 mai 2026. Pas cu pas pentru investitorii cu cont Revolut Stocks sau Revolut Trading,
          cu exemplu numeric și capcanele specifice.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Revolut Trading operează prin Revolut Securities Europe UAB (Lituania) și nu are reprezentanță fiscală în
          România. Brokerul nu reține impozitul, deci tu calculezi și declari în Declarația Unică (D212) până pe 25
          mai. Plătești 10% pe câștigul net din vânzări și 10% pe dividendele primite, cu credit pentru reținerea
          străină. CASS dacă suma veniturilor tale non-salariale depășește pragurile.
        </p>
        <p className="mt-3 text-sm">
          <button
            onClick={() => navigate('/pricing')}
            className="text-accent dark:text-accent-light font-medium underline hover:no-underline"
          >
            Vrei calculul automat din extrasul Revolut? Vezi planuri →
          </button>
        </p>
      </section>

      <section className="mb-10 p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          Revolut este în beta. Verifică cifrele înainte să depui.
        </h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Suportul pentru Revolut este construit pe formatul publicat al extrasului Account Statement, dar nu am
          validat încă suficiente extrase reale de la utilizatori. Până confirmăm cel puțin 3 extrase reale care se
          procesează corect end-to-end, Revolut rămâne marcat ca beta: compară întotdeauna rezultatul cu extrasul tău
          înainte să trimiți declarația. În plus, formatul actual Revolut nu detaliază impozitul reținut la sursă pe
          dividende, așa că InvesTax aplică 10% pe tot dividendul, fără credit pentru reținerea străină. Asta
          supraestimează impozitul pe dividende (direcția sigură, niciodată sub-declarat), deci verifică manual partea
          de dividende. Pentru Trading212, în schimb, parserul este validat pe extrase reale.
        </p>
      </section>

      <Section title="Ce extras încarci în InvesTax">
        <p>
          Pentru calculul automat, InvesTax citește un singur fișier: <strong>Account Statement</strong> (extrasul de
          cont cu istoricul complet de tranzacții), exportat ca Excel. <em>Nu</em> rezumatul Profit &amp; Loss și nici
          Cost &amp; Charges Report, acelea sunt sinteze și nu conțin tranzacțiile brute. Pașii în aplicația Revolut:
        </p>
        <ol className="list-decimal list-outside pl-6 space-y-2 mt-3">
          <li>
            Deschide secțiunea <strong>Invest</strong> (Stocks) și apasă <strong>More</strong>.
          </li>
          <li>
            Mergi la <strong>Documents → Stocks → Account Statement</strong>.
          </li>
          <li>
            Alege tab-ul <strong>Excel</strong> (nu PDF) și setează perioada pe <strong>All time</strong>, ca să
            prindă tot costul de achiziție, nu doar anul fiscal.
          </li>
          <li>
            Apasă <strong>Get statement</strong>. Fișierul descărcat este <strong>.xlsx</strong> (dacă îl convertești
            tu în .csv, merge și așa).
          </li>
        </ol>
        <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Etichetele din meniu pot diferi în aplicația în limba română</strong>, dar denumirile coloanelor
              din fișier rămân în engleză. Dacă încarci rezumatul P&amp;L în loc de Account Statement, procesarea
              afișează un avertisment în loc să raporteze un număr greșit.
            </span>
          </p>
        </div>
      </Section>

      <Section title="Ce este acoperit în beta">
        <p>Suportul Revolut în beta procesează:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>
            <strong>Cumpărările și vânzările</strong> de acțiuni și ETF-uri (inclusiv fracționare), pe care se
            calculează câștigul net pe metoda CMP.
          </li>
          <li>
            <strong>Dividendele</strong>, dar fără reținerea la sursă: formatul actual nu o detaliază, deci impozitul
            pe dividende este calculat integral la 10% (vezi caseta beta de mai sus).
          </li>
          <li>
            <strong>Split-urile forward</strong> sunt aplicate automat; split-urile inverse (reverse split) afișează un
            avertisment în loc să fie ghicite.
          </li>
          <li>
            <strong>Valutele USD, EUR, GBP și RON.</strong> Alte valute sunt ignorate cu avertisment.
          </li>
        </ul>
        <p className="mt-3">
          Mișcările de numerar (top-up, retrageri), comisioanele de custodie și transferurile între entitățile Revolut
          nu sunt venituri impozabile și sunt ignorate. Orice tip de rând necunoscut oprește procesarea cu un
          avertisment, ca să nu raportăm un total parțial.
        </p>
      </Section>

      <Section title="Cine trebuie să declare?">
        <p>
          Orice persoană fizică rezidentă fiscal în România care a avut activitate pe Revolut Trading în 2025: vânzări
          de acțiuni sau ETF-uri, dividende primite, dobânzi din Pockets sau Savings. Inclusiv:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>Pe oricine a vândut și a rămas pe câștig sau pe pierdere (pierderile se declară și ele).</li>
          <li>Pe oricine a primit dividende din străinătate, indiferent de sumă.</li>
          <li>Pe oricine a primit dobânzi de la produsele Revolut Savings / Pockets / Flexible Accounts.</li>
        </ul>
        <p className="mt-3">
          Dacă ai depus bani și ai cumpărat acțiuni dar nu ai vândut nimic în 2025, nu ai obligație pe partea de
          tranzacții. Dividendele și dobânzile primite, însă, se declară.
        </p>
      </Section>

      <Section title="Ce documente îți trebuie">
        <ol className="list-decimal list-outside pl-6 space-y-3">
          <li>
            <strong>Account Statement-ul Revolut</strong> (extrasul de cont, Excel .xlsx) pentru tot istoricul,
            exportat ca în secțiunea de mai sus. Conține toate tranzacțiile, dividendele și mișcările de numerar. Este
            același fișier pe care îl încarci în InvesTax pentru calculul automat.
          </li>
          <li>
            <strong>Cursurile BNR pentru zilele cu tranzacții.</strong> De pe bnr.ro (secțiunea Cursul BNR) sau dintr-o
            arhivă de tip cursbnr.ro pentru istoric rapid.
          </li>
          <li>
            <strong>Certificatul de reținere a impozitului pe dividende</strong>, dacă vrei să aplici creditul fiscal.
            Pentru acțiuni americane, formularul 1042-S de la IRS sau atestatul Revolut. Fără el, ANAF poate să nu
            recunoască reducerea.
          </li>
          <li>
            <strong>Acces la SPV</strong> pe anaf.ro. Cont creat pe baza CNP-ului, validat în Buletin sau prin IBAN.
          </li>
          <li>
            <strong>Datele tale fiscale:</strong> CNP, adresă completă, IBAN.
          </li>
        </ol>
      </Section>

      <Section title="Pașii completi">
        <Step number={1} title="Descarcă Account Statement-ul din Revolut">
          <p>
            Folosește rețeta de export de mai sus (Invest → More → Documents → Stocks → Account Statement → Excel → All
            time). Fișierul .xlsx conține toate tranzacțiile, dividendele și mișcările de numerar pe perioada aleasă.
            Exportă tot istoricul, nu doar anul fiscal, ca să fie corect costul de achiziție pe metoda CMP.
          </p>
        </Step>

        <Step number={2} title="Calculează câștigul net pe metoda CMP">
          <p>
            Pentru auto-declarare la broker nerezident, ambele metode sunt folosite în practica retail:{' '}
            <strong>FIFO</strong> (cel mai vechi cumpărat este primul vândut) sau{' '}
            <strong>Costul Mediu Ponderat (CMP)</strong> (medie ponderată pe instrument). Alege una și aplic-o
            consistent pe toate vânzările. InvesTax folosește CMP.
            Ideea CMP: faci o medie ponderată a prețurilor la care ai cumpărat o acțiune și câștigul tău este
            diferența dintre prețul de vânzare și costul mediu actual.
          </p>
          <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
            <p className="font-medium mb-2">Exemplu:</p>
            <p>
              Cumperi 20 acțiuni VOO la 450 USD, apoi 10 la 470 USD. Costul mediu = (20×450 + 10×470) / 30 = 456,67 USD.
              Vinzi 15 la 500 USD. Câștig brut = 15 × (500 − 456,67) = <strong>650 USD</strong>. Comisioanele Revolut la
              cumpărare se adaugă la cost; cele la vânzare se scad din încasări.
            </p>
          </div>
          <p>
            Aplici regula pentru fiecare instrument în parte, aduni câștigurile și scazi pierderile. Rezultatul net
            anual este ce treci la rubrica de transfer titluri.
          </p>
        </Step>

        <Step number={3} title="Convertește în RON la cursul BNR">
          <p>
            ANAF acceptă numai cifrele în RON, iar regula de curs BNR diferă între tranzacții și dividende, conform
            Codului Fiscal. Cursul intern Revolut (cel cu care s-a executat ordinul) nu este acceptat în niciun caz.
          </p>
          <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
            <li>
              <strong>Câștiguri din transferul titlurilor de valoare</strong> (vânzări de acțiuni / ETF-uri): se
              aplică cursul BNR valabil la <strong>data fiecărei tranzacții</strong> (Codul Fiscal art. 96).
              Diferențele de curs între cumpărare și vânzare sunt o componentă reală a câștigului tău în RON.
            </li>
            <li>
              <strong>Dividende primite în valută străină</strong>: conversia în RON se face la <strong>cursul mediu
              anual BNR al pieței valutare, comunicat pentru anul în care s-a realizat venitul</strong> (Codul
              Fiscal art. 131 alin. 6), nu la cursul din ziua fiecărei plăți. De exemplu, dividende în USD primite
              în 2025 se convertesc la cursul mediu BNR USD/RON pentru anul 2025 (4,4705 RON/USD).
            </li>
          </ul>
        </Step>

        <Step number={4} title="Calculează dividendele cu credit pentru reținerea străină">
          <p>
            Revolut Stocks (Revolut Securities Europe UAB) generează și semnează automat formularul W-8BEN la
            deschiderea contului. Pentru rezidenții români, impozitul reținut la sursă pe dividendele din acțiuni
            americane este 10% conform tratatului RO-SUA, nu 30%. Verifică extrasul fiscal anual pentru rata efectivă
            pe fiecare dividend, în special pentru REIT-uri sau acțiuni non-SUA.
          </p>
          <p className="mt-3">
            În România datorezi 10% pe dividend brut. Primești credit pentru reținerea străină până la limita
            impozitului român. Concret:
          </p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
            <li>Dividend brut: 50 USD</li>
            <li>Reținut în SUA (cu W-8BEN): 5 USD</li>
            <li>Impozit datorat în RO: 10% × 50 = 5 USD</li>
            <li>Credit pentru reținerea străină: 5 USD (limitat la impozitul RO)</li>
            <li>De plătit ANAF: <strong>0 USD</strong></li>
          </ul>
          <p className="mt-3">
            Dacă reținerea străină este egală sau mai mare cu impozitul român, în RO nu mai plătești nimic pe acel
            dividend. Dar îl declari oricum, cu reținerea străină ca credit. Pentru documentare ai nevoie de un act
            oficial: 1042-S de la IRS sau certificatul Revolut.
          </p>
        </Step>

        <Step number={5} title="Verifică pragul CASS">
          <p>
            CASS (contribuția la sănătate) este 10% și se plătește pe baza pragurilor de venit non-salarial:
          </p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
            <li>Sub 6 salarii minime brute pe an: nu plătești CASS pe veniturile din investiții.</li>
            <li>Între 6 și 12 salarii minime: CASS de 10% pe 6 salarii minime.</li>
            <li>Între 12 și 24: CASS pe 12 salarii minime.</li>
            <li>Peste 24: CASS pe 24 salarii minime.</li>
          </ul>
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-400 italic">
            (Salariul minim brut pe 2025 a fost 4.050 RON/lună, conform Hotărârii de Guvern 1506/2024. Pragul de 6
            salarii minime = 24.300 RON pe an.)
          </p>
          <p className="mt-3">
            Pragul se calculează pe SUMA tuturor veniturilor tale non-salariale (dividende + câștiguri + dobânzi +
            chirii + altele), nu doar pe Revolut. Pentru detalii, vezi ghidul nostru despre{' '}
            <button
              onClick={() => navigate('/ghid/cass-investitii')}
              className="text-accent dark:text-accent-light underline hover:no-underline"
            >
              CASS pe investiții
            </button>
            .
          </p>
        </Step>

        <Step number={6} title="Completează DU online pe ANAF SPV">
          <p>
            Te autentifici în SPV pe anaf.ro și deschizi Declarația Unică (D212) pentru anul fiscal 2025, depusă în
            2026.
          </p>
          <p className="mt-3">Secțiunile relevante pentru Revolut:</p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
            <li>
              <strong>Veniturile din transferul titlurilor de valoare</strong> pentru câștigul net (sau pierderea ca
              sumă negativă).
            </li>
            <li>
              <strong>Veniturile din dividende din străinătate</strong> cu suma brută în RON și reținerea străină ca
              credit.
            </li>
            <li>
              <strong>Veniturile din dobânzi</strong> dacă ai folosit Pockets / Savings / Flexible Accounts.
            </li>
            <li>
              <strong>CASS:</strong> bifezi pragul aplicabil dacă depășești limita.
            </li>
          </ul>
          <p className="mt-3">
            Semnezi electronic și trimiți. Plata impozitului se face la termenul afișat de ANAF după validare, de
            regulă tot 25 mai.
          </p>
        </Step>
      </Section>

      <Section title="Exemplu lucrat">
        <p>Să zicem că ai avut în 2025 pe Revolut:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>10 februarie: cumpărat 20 VOO la 450 USD/acțiune.</li>
          <li>5 iunie: cumpărat încă 10 VOO la 470 USD.</li>
          <li>14 noiembrie: vândut 15 VOO la 500 USD.</li>
          <li>3 plăți de dividend de la VOO totalizând 18 USD brut, cu reținere 1,80 USD (10% cu W-8BEN).</li>
        </ul>

        <p className="mt-4 font-medium">Calcule:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
          <li>Cost mediu ponderat VOO: (20×450 + 10×470) / 30 = 456,67 USD per acțiune.</li>
          <li>Vânzare brută: 15 × 500 = 7.500 USD.</li>
          <li>Cost al celor 15 acțiuni vândute: 15 × 456,67 = 6.850 USD.</li>
          <li><strong>Câștig brut: 650 USD.</strong></li>
        </ul>

        <p className="mt-4">
          Conversie la cursul BNR din data tranzacției. Conform BNR, cursul oficial din 14 noiembrie 2025 a fost
          4,3768 RON/USD: 650 × 4,3768 ≈ 2.844,92 RON. Treci la rubrica de transfer titluri.
        </p>
        <p className="mt-2">
          Impozit pe câștig: 2.844,92 × 10% = <strong>284,49 RON</strong>.
        </p>

        <p className="mt-4 font-medium">Pentru dividende:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
          <li>Brut total: 18 USD. Convertit la cursul mediu anual BNR USD/RON pentru 2025 (4,4705 RON/USD): 18 × 4,4705 ≈ 80,47 RON.</li>
          <li>Reținut în SUA: 1,80 USD × 4,4705 ≈ 8,05 RON.</li>
          <li>Impozit datorat RO: 80,47 × 10% ≈ 8,05 RON.</li>
          <li>Credit pentru reținere străină: 8,05 RON (limitat la impozitul RO).</li>
          <li><strong>De plătit ANAF pe dividende: 0 RON.</strong></li>
        </ul>

        <p className="mt-4">
          Treci 80,47 RON la dividende din străinătate, cu 8,05 RON reținere străină.
        </p>
        <p className="mt-2">
          Verificare CASS: total venituri non-salariale din Revolut = 2.844,92 + 80,47 = 2.925,39 RON. Mult sub
          pragul de 24.300 RON pentru 2025. Dacă nu ai alte venituri non-salariale care să te ducă peste prag, nu
          datorezi CASS.
        </p>
        <p className="mt-4 p-3 bg-accent/10 rounded-lg font-medium">
          Total de plată ANAF: <strong>284,49 RON</strong> impozit pe câștig.
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Descarci rezumatul Profit &amp; Loss în loc de Account Statement.</strong> Rezumatul P&amp;L și Cost
          &amp; Charges Report sunt sinteze, nu conțin tranzacțiile brute de care are nevoie calculul. Pentru
          încărcarea în InvesTax exporți Account Statement-ul în Excel, pe perioada All time.
        </Mistake>
        <Mistake>
          <strong>Cursul intern Revolut.</strong> ANAF nu acceptă cursul de schimb folosit de Revolut la executarea
          ordinului. Folosești doar cursul BNR oficial, cu reguli diferite pe tip de venit: pentru tranzacții,
          cursul BNR din ziua fiecărei tranzacții (Codul Fiscal art. 96); pentru dividende, cursul mediu anual BNR
          pentru anul fiscal respectiv (Codul Fiscal art. 131 alin. 6).
        </Mistake>
        <Mistake>
          <strong>Confuzia Revolut Bank vs Revolut Trading.</strong> Card-ul Revolut Bank și serviciile bancare nu
          generează venituri din titluri de valoare. Tranzacțiile bursiere apar doar în Revolut Stocks / Trading
          (Revolut Securities Europe UAB).
        </Mistake>
        <Mistake>
          <strong>Omiterea dobânzilor de la Pockets / Savings.</strong> Dobânzile primite în 2025, oricât de mici, se
          declară la rubrica de venituri din dobânzi.
        </Mistake>
        <Mistake>
          <strong>Ignorarea pierderilor.</strong> Pierderea netă anuală din transferul titlurilor de valoare prin
          brokeri fără reprezentanță în România se reportează 5 ani fiscali consecutivi, în limita a 70% din
          câștigurile nete viitoare. Pentru pierderile din străinătate, compensarea se face cu câștiguri de aceeași
          natură și sursă, pentru fiecare țară în parte (Codul Fiscal art. 119). Fără declararea în anul curent,
          beneficiul reportării se pierde.
        </Mistake>
        <Mistake>
          <strong>Considerarea Revolut ca având reprezentanță în RO.</strong> Revolut Securities Europe UAB este în
          Lituania, deci nu reține impozit la sursă pentru rezidenții români. Tu calculezi tot, tu declari.
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Sau folosește calculatorul</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Dacă pașii ăștia ți se par prea mult de lucru, InvesTax aplică automat metoda CMP, cursurile BNR și pragurile CASS.
              Calculatorul manual gratuit funcționează cu cifrele tale brute; pentru încărcarea automată a Account
              Statement-ului Revolut (beta) ai nevoie de un plan plătit.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => navigate('/calculator')} className="btn-secondary inline-flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator gratuit (manual)
              </button>
              <button onClick={() => navigate('/pricing')} className="btn-primary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Încarcă extrasul Revolut (beta)
              </button>
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

      <GhidRelatedGuides currentPath="/ghid/declaratie-unica-revolut" />

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
          Acest ghid este informativ și acoperă regulile pentru anul fiscal 2025. Suportul Revolut este în beta:
          verifică cifrele față de extrasul tău înainte de depunere. Dacă ai venituri complexe sau dubii pe regimul
          fiscal aplicabil unui produs Revolut specific, consultă un contabil. ANAF publică ghidul oficial al
          Declarației Unice anual pe anaf.ro.
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

function Mistake({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3">
      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-base text-gray-700 dark:text-slate-300 leading-relaxed">{children}</p>
    </div>
  );
}
