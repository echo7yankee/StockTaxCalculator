import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator } from 'lucide-react';
import {
  GHID_REVOLUT_FAQS as FAQS,
  GHID_REVOLUT_ARTICLE_SCHEMA as articleSchema,
  GHID_REVOLUT_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidRevolutSchemas';

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
        <link rel="canonical" href="https://investax.app/ghid/declaratie-unica-revolut" />
        <meta property="og:title" content="Cum declar Revolut Trading în Declarația Unică 2026" />
        <meta
          property="og:description"
          content="Ghid pentru investitorii Revolut: pași, exemplu lucrat, greșeli frecvente, FAQ. Deadline 25 mai 2026."
        />
        <meta property="og:url" content="https://investax.app/ghid/declaratie-unica-revolut" />
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
          mai. Plătești 10% pe câștigul net din vânzări (cost mediu ponderat) și 10% pe dividendele primite, cu credit
          pentru reținerea străină. CASS dacă suma veniturilor tale non-salariale depășește pragurile.
        </p>
      </section>

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
            <strong>Raportul fiscal anual de la Revolut.</strong> În aplicație: Stocks → meniul cu trei puncte →
            Statements (sau Documents) → cere Annual Statement / Tax Statement pentru perioada 1 ianuarie 2025 - 31
            decembrie 2025. Dacă opțiunea nu apare în meniul tău, deschide un chat cu suportul Revolut și cere explicit
            "Annual Tax Statement for 2025".
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
        <Step number={1} title="Descarcă raportul fiscal anual din Revolut">
          <p>
            În unele versiuni ale aplicației, opțiunea Tax Statement apare automat după 1 februarie. În altele, trebuie
            cerută din chat-ul de suport. Răspunsul vine în 1-3 zile lucrătoare cu PDF-ul atașat. Conține toate
            tranzacțiile, dividendele, dobânzile și taxele reținute pe anul calendaristic.
          </p>
        </Step>

        <Step number={2} title="Calculează câștigul net pe metoda CMP">
          <p>
            În România se aplică <strong>Costul Mediu Ponderat (CMP)</strong> pentru fiecare instrument. Ideea: faci o
            medie ponderată a prețurilor la care ai cumpărat o acțiune și câștigul tău este diferența dintre prețul de
            vânzare și costul mediu actual.
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

        <Step number={3} title="Convertește în RON la cursul BNR pe data tranzacției">
          <p>
            ANAF acceptă numai cifrele în RON. Pentru fiecare tranzacție iei cursul BNR oficial din ziua respectivă.
            Cursul intern Revolut (cel cu care s-a executat ordinul) nu este acceptat.
          </p>
          <p className="mt-3">
            Punct important: cursul se aplică pe <strong>data tranzacției</strong>, nu pe data raportului și nici un
            curs mediu anual. Diferențele de curs între cumpărare și vânzare sunt o componentă reală a câștigului tău
            în RON.
          </p>
        </Step>

        <Step number={4} title="Calculează dividendele cu credit pentru reținerea străină">
          <p>
            Revolut reține impozit pe dividende la sursă, în țara emitentului. Pentru acțiunile americane, rata
            standard fără W-8BEN este 30%; cu W-8BEN rezolvat de Revolut e 10%, conform tratatului România-SUA.
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
          Conversie la cursul BNR din 14 noiembrie 2025 (presupunem 4,55 RON/USD): 650 × 4,55 ≈ 2.957,50 RON. Treci la
          rubrica de transfer titluri.
        </p>
        <p className="mt-2">
          Impozit pe câștig: 2.957,50 × 10% = <strong>295,75 RON</strong>.
        </p>

        <p className="mt-4 font-medium">Pentru dividende:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
          <li>Brut total: 18 USD. Convertit la cursurile zilelor de plată (presupunem 4,50 RON/USD în medie): 81 RON.</li>
          <li>Reținut în SUA: 1,80 USD ≈ 8,10 RON.</li>
          <li>Impozit datorat RO: 81 × 10% = 8,10 RON.</li>
          <li>Credit pentru reținere străină: 8,10 RON.</li>
          <li><strong>De plătit ANAF pe dividende: 0 RON.</strong></li>
        </ul>

        <p className="mt-4">
          Treci 81 RON la dividende din străinătate, cu 8,10 RON reținere străină.
        </p>
        <p className="mt-2">
          Verificare CASS: total venituri non-salariale din Revolut = 2.957,50 + 81 = 3.038,50 RON. Mult sub pragul de
          24.300 RON pentru 2025. Dacă nu ai alte venituri non-salariale care să te ducă peste prag, nu datorezi CASS.
        </p>
        <p className="mt-4 p-3 bg-accent/10 rounded-lg font-medium">
          Total de plată ANAF: <strong>295,75 RON</strong> impozit pe câștig.
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Cursul intern Revolut.</strong> ANAF nu acceptă cursul de schimb folosit de Revolut la executarea
          ordinului. Doar cursul BNR oficial din ziua tranzacției.
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
          <strong>Ignorarea pierderilor.</strong> Pierderile nete se reportează 5 ani fiscali consecutivi, în limita
          a 70% din câștigurile nete viitoare. Fără declararea în anul curent, beneficiul reportării se pierde.
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
              Dacă pașii ăștia sunt prea mult, InvesTax automatizează tot procesul: introduci cifrele tale (sau încarci
              raportul când broker-ul tău este suportat în versiunea PDF), primești cifrele formatate pentru
              Declarația Unică, în RON, cu CMP și conversiile BNR aplicate. Versiune gratuită pentru calculul manual,
              plan plătit pentru încărcarea automată a extraselor.
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

      <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-navy-700 text-sm text-gray-500 dark:text-slate-400">
        <p>
          Acest ghid este informativ. Dacă ai venituri complexe sau dubii pe regimul fiscal aplicabil unui produs
          Revolut specific, consultă un contabil. ANAF publică ghidul oficial al Declarației Unice anual pe anaf.ro.
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
