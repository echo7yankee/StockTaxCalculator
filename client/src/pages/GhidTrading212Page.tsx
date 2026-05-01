import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator } from 'lucide-react';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Trebuie să declar dacă nu am vândut nimic în 2025?',
    a: 'Nu pentru tranzacții (n-ai realizat câștig). Da pentru dividende și dobânzi, dacă le-ai primit.',
  },
  {
    q: 'Ce fac dacă am pierdere netă?',
    a: 'Treci pierderea în declarație ca sumă negativă. Nu plătești impozit pe câștig (pentru că nu ai). Pentru brokeri fără reprezentanță în România (Trading212, Revolut, IBKR), pierderea se reportează 5 ani fiscali consecutivi și se compensează cu maxim 70% din câștigurile nete viitoare.',
  },
  {
    q: 'Cum convertesc dolarii și euro în RON?',
    a: 'Cursul BNR oficial din ZIUA tranzacției. Pentru dividende, ziua plății. Sursa oficială este bnr.ro. Practic, cursbnr.ro îți dă instant cursul pe orice dată.',
  },
  {
    q: 'Pot deduce comisioanele?',
    a: 'Da. Comisioanele de cumpărare se adaugă la cost. Comisioanele de vânzare se scad din încasări.',
  },
  {
    q: 'Ce se întâmplă dacă uit deadline-ul de 25 mai?',
    a: 'Dobânzi 0,02% pe zi + penalități 0,01% pe zi = 0,03% pe zi din suma datorată. Plus posibilă amendă administrativă (50-500 RON pentru persoane fizice). Dacă ANAF descoperă obligații nedeclarate prin inspecție, se aplică în plus o penalitate de nedeclarare de 0,08% pe zi. Tot trebuie să depui declarația, doar că plătești și extra.',
  },
  {
    q: 'Trebuie să declar și acțiunile fracționare?',
    a: 'Da. Tratamentul este identic cu acțiunile întregi.',
  },
  {
    q: 'Ce diferență este între Trading212 și XTB la declarare?',
    a: 'XTB are sucursală în România și reține impozitul la sursă (1% pe profit pentru deținere peste 365 de zile, 3% pentru sub). Pentru tranzacțiile XTB nu mai trebuie să declari profitul. Trading212 nu are reprezentanță, deci tu calculezi și declari totul.',
  },
  {
    q: 'Cum declar dividendele de la Trading212?',
    a: 'La rubrica de venituri din dividende din străinătate. Suma brută în RON și reținerea străină ca credit pentru impozitul datorat în România.',
  },
];

export default function GhidTrading212Page() {
  const navigate = useNavigate();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Cum declar tranzacțiile Trading212 în Declarația Unică 2026',
    datePublished: '2026-05-01',
    author: { '@type': 'Organization', name: 'InvesTax' },
    publisher: {
      '@type': 'Organization',
      name: 'InvesTax',
      url: 'https://investax.app/',
    },
    inLanguage: 'ro',
    mainEntityOfPage: 'https://investax.app/ghid/declaratie-unica-trading212',
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Cum declar Trading212 în Declarația Unică 2026 | InvesTax</title>
        <meta
          name="description"
          content="Ghid complet: cum declari câștigurile, pierderile și dividendele de la Trading212 în Declarația Unică 2026. Pași, exemplu lucrat, greșeli frecvente, FAQ. Deadline 25 mai."
        />
        <link rel="canonical" href="https://investax.app/ghid/declaratie-unica-trading212" />
        <meta property="og:title" content="Cum declar Trading212 în Declarația Unică 2026" />
        <meta
          property="og:description"
          content="Ghid complet pentru investitorii Trading212: pași, exemplu lucrat, greșeli frecvente, FAQ. Deadline 25 mai 2026."
        />
        <meta property="og:url" content="https://investax.app/ghid/declaratie-unica-trading212" />
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
          Cum declar tranzacțiile Trading212 în Declarația Unică 2026
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Deadline: 25 mai 2026. Ghid pas cu pas pentru investitorii cu cont Trading212, cu exemplu numeric și
          cele mai frecvente greșeli.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Trading212 nu are reprezentanță în România, deci brokerul nu reține impozitul. Trebuie să-ți faci singur
          calculele și să le treci în Declarația Unică (D212), depusă online pe portalul ANAF SPV până pe 25 mai.
          Plătești 10% pe câștigul net din tranzacții (calculat pe metoda costului mediu ponderat) și 10% pe
          dividende, cu credit pentru reținerea străină. Plus CASS dacă totalul tău de venituri non-salariale
          depășește 6 salarii minime.
        </p>
      </section>

      <Section title="Cine trebuie să declare?">
        <p>
          Orice persoană fizică rezidentă în România care a avut tranzacții pe Trading212 în 2025 trebuie să depună
          Declarația Unică. Asta include:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>Pe oricine a vândut acțiuni sau ETF-uri și a obținut câștig sau pierdere (pierderile se declară și ele).</li>
          <li>Pe oricine a primit dividende, indiferent de sumă.</li>
          <li>Pe oricine are dobânzi din depozitele sau cardul de cash din Trading212.</li>
        </ul>
        <p className="mt-3">
          Dacă în 2025 doar ai cumpărat și nu ai vândut nimic, nu ai obligație pe partea de tranzacții. Dividendele
          primite, însă, trebuie declarate chiar dacă n-ai vândut nicio acțiune.
        </p>
      </Section>

      <Section title="Ce documente îți trebuie">
        <ol className="list-decimal list-outside pl-6 space-y-3">
          <li>
            <strong>Raportul fiscal anual de la Trading212.</strong> Îl ceri din aplicație: Settings → Help &amp; Contact
            → Submit a request → subiect "Tax Statement". Vine pe email în 1-3 zile lucrătoare. Format PDF, conține
            toate tranzacțiile, dividendele și dobânzile pe anul calendaristic.
          </li>
          <li>
            <strong>Cursul BNR pentru fiecare zi cu tranzacții.</strong> De pe bnr.ro, secțiunea Cursul BNR, sau orice
            arhivă (cursbnr.ro este cea mai practică pentru istoric).
          </li>
          <li>
            <strong>Acces la SPV</strong> pe anaf.ro. Dacă nu ai cont, fă-ți unul cu CNP-ul, validat în Buletin sau
            cu IBAN.
          </li>
          <li>
            <strong>Datele tale fiscale:</strong> CNP, adresă, IBAN pentru eventual return.
          </li>
        </ol>
      </Section>

      <Section title="Pașii completi">
        <Step number={1} title="Descarcă raportul fiscal anual din Trading212">
          <p>
            Aplicația Trading212 nu generează raportul automat. Trebuie să-l ceri prin formular. În cerere scrie ceva
            de genul: <em>"I need my Annual Tax Statement for the period 1 January 2025 to 31 December 2025."</em>{' '}
            Vine cu toate operațiunile pe an.
          </p>
        </Step>

        <Step number={2} title="Calculează câștigul net pe metoda CMP">
          <p>
            În România, metoda standard pentru câștigul din vânzarea de acțiuni este{' '}
            <strong>Costul Mediu Ponderat (CMP)</strong>. Logica: faci o medie ponderată a prețurilor la care ai
            cumpărat o acțiune, iar câștigul tău este diferența dintre prețul de vânzare și costul mediu.
          </p>
          <div className="my-4 p-4 bg-navy-700/20 dark:bg-navy-750/40 rounded-lg text-sm">
            <p className="font-medium mb-2">Exemplu:</p>
            <p>
              Cumperi 10 acțiuni AAPL la 180 USD, apoi 5 la 200 USD. Costul mediu = (10×180 + 5×200) / 15 = 186,67
              USD per acțiune. Vinzi 8 la 220 USD. Câștigul brut = 8 × (220 − 186,67) = <strong>266,67 USD</strong>.
              Comisioanele plătite la cumpărare se adaugă la cost; comisioanele la vânzare se scad din încasări.
            </p>
          </div>
          <p>
            Faci asta pentru fiecare instrument. Aduni câștigurile, scazi pierderile, ai câștigul net anual.
          </p>
        </Step>

        <Step number={3} title="Convertește totul în RON la cursul BNR pe data tranzacției">
          <p>
            ANAF vrea cifrele în RON. Pentru fiecare tranzacție, iei cursul BNR oficial din ziua respectivă și
            convertești suma valutară.
          </p>
          <p className="mt-3">
            Punct important: cursul se aplică pe <strong>data tranzacției</strong>, nu pe data raportului și nici
            cursul mediu anual. Dacă ai cumpărat în martie și ai vândut în octombrie, fiecare leg are cursul lui.
            Diferența de curs se reflectă în câștig.
          </p>
        </Step>

        <Step number={4} title="Calculează dividendele cu credit pentru reținere străină">
          <p>
            Trading212 reține impozit pe dividende la sursă (în țara emitentului). Pentru acțiuni americane, reținerea
            este 30% dacă nu ai completat formularul W-8BEN, sau 10% dacă l-ai completat (rata aplicabilă conform
            tratatului de evitare a dublei impuneri România-SUA).
          </p>
          <p className="mt-3">
            În România plătești 10% pe dividend. Primești credit pentru reținerea străină până la limita impozitului
            român. Concret:
          </p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
            <li>Dividend brut: 100 USD</li>
            <li>Reținut în SUA (cu W-8BEN): 10 USD</li>
            <li>Impozit datorat în RO: 10% × 100 = 10 USD</li>
            <li>Credit pentru reținerea străină: 10 USD (limitat la impozitul RO)</li>
            <li>De plătit ANAF: <strong>0 USD</strong></li>
          </ul>
          <p className="mt-3">
            Practic, dacă reținerea străină este egală sau mai mare cu impozitul român (10%), nu mai plătești nimic
            în România pe acel dividend. Dar îl treci totuși în declarație. Important: pentru a aplica creditul fiscal
            ai nevoie de un document oficial care atestă reținerea (Form 1042-S de la IRS sau certificatul
            brokerului). Fără el, ANAF poate să nu recunoască creditul. Convertește totul în RON.
          </p>
        </Step>

        <Step number={5} title="Verifică pragul CASS">
          <p>
            CASS (contribuția la sănătate) este separată de impozit. Se aplică 10% pe baza pragurilor:
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
            Important: pragul se calculează pe SUMA tuturor veniturilor tale non-salariale (dividende + câștiguri din
            transfer + chirii + dobânzi + altele), nu doar pe Trading212.
          </p>
        </Step>

        <Step number={6} title="Completează DU online pe ANAF SPV">
          <p>
            Intri pe anaf.ro/declaratii/duf, autentificat în SPV. Selectezi Declarația Unică (D212) pentru anul
            fiscal 2025, depusă în 2026.
          </p>
          <p className="mt-3">Secțiunile relevante pentru Trading212:</p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
            <li>
              <strong>Veniturile din transferul titlurilor de valoare</strong> (capitolul cu câștigul/pierderea din
              tranzacții). Treci câștigul net, sau pierderea ca sumă negativă.
            </li>
            <li>
              <strong>Veniturile din dividende din străinătate.</strong> Treci suma brută a dividendelor și reținerea
              străină ca credit.
            </li>
            <li>
              <strong>CASS:</strong> bifează dacă depășești pragul.
            </li>
          </ul>
          <p className="mt-3">
            Trimiți declarația semnată electronic. Plata impozitului se face la termenul afișat de ANAF după validare
            (de obicei tot 25 mai).
          </p>
        </Step>
      </Section>

      <Section title="Exemplu lucrat">
        <p>Să zicem că ai avut în 2025:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3">
          <li>15 ianuarie: cumpărat 10 AAPL la 180 USD/acțiune.</li>
          <li>20 martie: cumpărat încă 5 AAPL la 200 USD.</li>
          <li>5 octombrie: vândut 8 AAPL la 220 USD.</li>
          <li>4 plăți de dividend de la AAPL pe parcursul anului, totalizând 12 USD brut, cu reținere 1,20 USD (10%, conform tratatului RO-SUA cu W-8BEN).</li>
        </ul>

        <p className="mt-4 font-medium">Calcule:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
          <li>Cost mediu ponderat AAPL: (10×180 + 5×200) / 15 = 186,67 USD per acțiune.</li>
          <li>Vânzare brută: 8 × 220 = 1.760 USD.</li>
          <li>Cost al celor 8 acțiuni vândute: 8 × 186,67 = 1.493,33 USD.</li>
          <li><strong>Câștig brut: 266,67 USD.</strong></li>
        </ul>

        <p className="mt-4">
          Conversie în RON la cursul BNR din 5 octombrie 2025 (presupunem 4,55 RON/USD): 266,67 × 4,55 ≈ 1.213,35 RON.
          Treci la rubrica de transfer titluri.
        </p>
        <p className="mt-2">
          Impozit pe câștig: 1.213,35 × 10% = <strong>121,34 RON</strong>.
        </p>

        <p className="mt-4 font-medium">Pentru dividende:</p>
        <ul className="list-disc list-outside pl-6 space-y-1 mt-3 text-sm">
          <li>Brut total: 12 USD. Convertit la cursurile zilelor de plată (presupunem mediat 4,50 RON/USD): 54 RON.</li>
          <li>Reținut în SUA: 1,20 USD ≈ 5,40 RON.</li>
          <li>Impozit datorat RO: 54 × 10% = 5,40 RON.</li>
          <li>Credit pentru reținere străină: 5,40 RON (limitat la impozitul RO).</li>
          <li><strong>De plătit ANAF pe dividende: 0 RON.</strong></li>
        </ul>

        <p className="mt-4">
          Treci 54 RON la rubrica dividende din străinătate, cu 5,40 RON reținere străină.
        </p>
        <p className="mt-2">
          Verificare CASS: total venituri non-salariale = 1.213,35 + 54 = 1.267,35 RON. Sub pragul de 6 salarii
          minime (24.300 RON pentru 2025). Nu datorezi CASS.
        </p>
        <p className="mt-4 p-3 bg-accent/10 rounded-lg font-medium">
          Total de plată ANAF: <strong>121,34 RON</strong> impozit pe câștig.
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Cursul greșit.</strong> Cursul BNR din ziua tranzacției. Nu cursul mediu anual, nu cursul de la
          sfârșitul anului, nu cursul afișat de Trading212.
        </Mistake>
        <Mistake>
          <strong>Omiterea pierderilor.</strong> Pierderile se declară. Nu schimbă suma de plată dacă ai pierdere
          netă, dar fără declarare nu le poți reporta în anii următori. Regula curentă pentru brokeri fără
          reprezentanță în România (Trading212, Revolut, IBKR): pierderile se compensează cu câștigurile din același
          an, iar diferența negativă se reportează 5 ani fiscali consecutivi, în limita a 70% din câștigurile nete
          viitoare.
        </Mistake>
        <Mistake>
          <strong>Confuzia Trading212 cu XTB.</strong> XTB are sucursală în România și reține impozitul la sursă (1%
          pe profit pentru deținere peste 365 de zile, 3% pentru sub). Pentru XTB nu mai declari câștigul. Pentru
          Trading212 da. Regimuri complet diferite.
        </Mistake>
        <Mistake>
          <strong>Ignorarea CASS pe brut.</strong> Mulți cred că dacă au pierdere netă pe Trading212, scapă de CASS.
          Greșit: pragul CASS se calculează pe SUMA veniturilor non-salariale (inclusiv dividende), nu pe câștigul
          net.
        </Mistake>
        <Mistake>
          <strong>Uitarea de fractional shares.</strong> Acțiunile fracționare (ex. 0,43 AAPL) se declară la fel ca
          acțiunile întregi.
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Sau folosește calculatorul</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Dacă pașii ăștia ți se par prea mult work, InvesTax face automat tot procesul: încarci PDF-ul de la
              Trading212, primești cifrele formatate pentru Declarația Unică, în RON, cu calculele CMP și conversiile
              BNR deja aplicate. Versiune gratuită pentru sume mici, plătit pentru tranzacții multiple.
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
          Acest ghid este informativ. Dacă ai venituri complexe sau dubii, consultă un contabil. ANAF publică ghidul
          oficial al Declarației Unice în fiecare an pe anaf.ro.
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
