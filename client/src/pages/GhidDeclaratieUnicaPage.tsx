import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator } from 'lucide-react';
import {
  GHID_DU_FAQS as FAQS,
  GHID_DU_ARTICLE_SCHEMA as articleSchema,
  GHID_DU_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidDeclaratieUnicaSchemas';

export default function GhidDeclaratieUnicaPage() {
  const navigate = useNavigate();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Cum completez Declarația Unică 2026: ghid complet | InvesTax</title>
        <meta
          name="description"
          content="Pas cu pas: SPV, capitolele D212, ce documente îți trebuie, cum corectezi greșelile, cum eviți amenzile. Pentru anul fiscal 2025, depus până pe 25 mai 2026."
        />
        <link rel="canonical" href="https://investax.app/ghid/cum-completez-declaratia-unica" />
        <meta property="og:title" content="Cum completez Declarația Unică 2026: ghid complet" />
        <meta
          property="og:description"
          content="SPV, capitolele D212, ce documente îți trebuie, cum corectezi greșelile, cum eviți amenzile."
        />
        <meta property="og:url" content="https://investax.app/ghid/cum-completez-declaratia-unica" />
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
          Cum completez Declarația Unică 2026: ghid complet
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Deadline: 25 mai 2026 pentru anul fiscal 2025. Tot ce ai nevoie ca să depui D212 fără greșeli: ce documente
          îți trebuie, ce capitole completezi, cum eviți penalitățile, cum corectezi dacă ai greșit.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Declarația Unică (D212) se depune online, prin SPV pe anaf.ro, până pe 25 mai 2026 pentru veniturile din
          2025. Conține toate veniturile non-salariale: investiții, chirii, dividende, PFA. Plata impozitului are
          termen tot 25 mai, în general. Pentru investitori la bursă (Trading212, Revolut, IBKR, eToro): câștigul net
          impozitat 10%, dividende 10% cu credit pentru reținerea străină, CASS pe pragul de venituri non-salariale.
        </p>
      </section>

      <Section title="Cine trebuie să depună D212 în 2026">
        <p>
          Declarația Unică este pentru toate veniturile non-salariale realizate în 2025. Nu trebuie să o depună cei
          care au DOAR salariu (impozitul + CAS + CASS sunt deja reținute și raportate de angajator).
        </p>
        <p className="mt-3">Trebuie să o depui dacă în 2025 ai avut una sau mai multe dintre situațiile:</p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>Vânzări de acțiuni, ETF-uri, obligațiuni pe brokeri fără reprezentanță în România (Trading212, Revolut, IBKR, eToro etc.).</li>
          <li>Dividende primite, indiferent de țara emitentului sau de sumă.</li>
          <li>Dobânzi din depozite, conturi de economii sau produse Revolut Pockets / Savings.</li>
          <li>Chirii din imobile, indiferent de regimul ales (impunere reală sau norma de venit).</li>
          <li>Activități independente (PFA): venituri sau pierderi pe sistem real, sau norma de venit.</li>
          <li>Drepturi de autor, închirieri în regim hotelier, alte venituri din proprietate intelectuală.</li>
          <li>Câștiguri din vânzarea aurului, criptomonedelor, monedelor virtuale.</li>
          <li>Pensii suplimentare private, pensii din străinătate.</li>
          <li>Vrei să declari venituri estimate pentru 2026 (caz tipic: PFA nou înființat).</li>
        </ul>
        <p className="mt-3">
          Dacă ești în orice combinație din lista de mai sus și depunerea D212 e obligatorie, evită să o lași pentru
          ultima zi. Sistemul ANAF este aglomerat în săptămâna 19-25 mai și pot apărea blocaje.
        </p>
      </Section>

      <Section title="De ce ai nevoie înainte să începi">
        <ol className="list-decimal list-outside pl-6 space-y-3">
          <li>
            <strong>Cont SPV pe anaf.ro.</strong> Dacă nu ai, fă-ți unul cu CNP-ul. Validare prin Buletin (la ghișeu cu
            certificat) sau prin IBAN (online, dar tot necesită câteva zile pentru aprobare). Nu lăsa pentru ultima
            săptămână.
          </li>
          <li>
            <strong>Documente fiscale per sursă de venit:</strong>
            <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
              <li>Pentru investiții: raportul fiscal anual de la fiecare broker.</li>
              <li>Pentru dividende: certificatul de reținere străină (formular 1042-S sau certificat broker).</li>
              <li>Pentru chirii: contractele de închiriere, dovada plăților.</li>
              <li>Pentru PFA: registrul de evidență a încasărilor și plăților.</li>
              <li>Pentru drepturi de autor: contractele și extrasele de plată.</li>
            </ul>
          </li>
          <li>
            <strong>Cursurile BNR pentru zilele cu tranzacții valutare.</strong> bnr.ro sau cursbnr.ro pentru istoric
            rapid.
          </li>
          <li>
            <strong>Datele tale fiscale:</strong> CNP, adresă completă, IBAN pentru eventual return.
          </li>
        </ol>
      </Section>

      <Section title="Pașii completi pe SPV">
        <Step number={1} title="Autentifică-te în SPV">
          <p>
            anaf.ro → SPV → autentificare cu credențialele tale. Dacă ai uitat parola, recuperarea durează 1-2 zile,
            deci nu amâna.
          </p>
        </Step>

        <Step number={2} title="Selectează Declarația Unică">
          <p>
            În meniul SPV: Servicii → Declaratii → Declaratia Unica (D212) → Anul fiscal 2025, depusă în 2026. Poți
            alege „Inițială" (prima depunere) sau „Rectificativă" (corectezi una existentă).
          </p>
        </Step>

        <Step number={3} title="Completează datele de identificare">
          <p>
            Sistemul prepopulează majoritatea datelor din contul tău fiscal. Verifică CNP-ul, adresa, IBAN-ul și
            corectează dacă e cazul.
          </p>
        </Step>

        <Step number={4} title="Completează capitolele relevante pentru tine">
          <p>D212 are mai multe capitole. Completezi doar pe cele aplicabile situației tale.</p>
          <p className="mt-3 font-medium">Pentru investitorii la bursă (broker fără reprezentanță RO):</p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>
              <strong>Capitolul „Veniturile din transferul titlurilor de valoare":</strong> câștigul net (sau
              pierderea ca sumă negativă) calculat pe metoda Costului Mediu Ponderat. Detalii în{' '}
              <button
                onClick={() => navigate('/ghid/declaratie-unica-trading212')}
                className="text-accent dark:text-accent-light underline hover:no-underline"
              >
                ghidul Trading212
              </button>
              {' '}sau{' '}
              <button
                onClick={() => navigate('/ghid/declaratie-unica-revolut')}
                className="text-accent dark:text-accent-light underline hover:no-underline"
              >
                ghidul Revolut
              </button>
              .
            </li>
            <li>
              <strong>Capitolul „Veniturile din dividende din străinătate":</strong> brutul în RON și reținerea
              străină ca credit. Detalii în{' '}
              <button
                onClick={() => navigate('/ghid/dividende-broker-strain')}
                className="text-accent dark:text-accent-light underline hover:no-underline"
              >
                ghidul dividendelor de la broker străin
              </button>
              .
            </li>
            <li>
              <strong>Capitolul „Veniturile din dobânzi":</strong> sume brute pentru depozite, Revolut Pockets / Savings
              etc.
            </li>
          </ul>
          <p className="mt-3 font-medium">Pentru CASS:</p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>
              <strong>Capitolul „Stabilirea contribuției de asigurări sociale de sănătate":</strong> bifezi pragul în
              care te încadrezi pe baza sumei totale a veniturilor non-salariale. Detalii în{' '}
              <button
                onClick={() => navigate('/ghid/cass-investitii')}
                className="text-accent dark:text-accent-light underline hover:no-underline"
              >
                ghidul CASS pe investiții
              </button>
              .
            </li>
          </ul>
          <p className="mt-3 font-medium">Pentru alte venituri:</p>
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>
              <strong>Capitolul „Veniturile din cedarea folosinței bunurilor":</strong> chirii (impunere reală sau
              normă, în funcție de opțiunea ta).
            </li>
            <li>
              <strong>Capitolul „Veniturile din activități independente":</strong> pentru PFA, drepturi de autor.
            </li>
          </ul>
        </Step>

        <Step number={5} title="Verifică totalurile și impozitul calculat">
          <p>
            Sistemul calculează automat impozitul pe venit (10% pe categoriile aplicabile) și CASS-ul (pe pragul
            bifat). Verifică să fie ce ai așteptat. Dacă vezi sume neașteptate, întoarce-te la capitolul respectiv și
            verifică intrările.
          </p>
        </Step>

        <Step number={6} title="Transmite declarația">
          <p>
            La final apasă „Transmite" / „Depune". Sistemul îți generează un număr de înregistrare. Salvează-l. Treci
            în secțiunea „Mesaje" sau „Documente trimise" ca să vezi confirmarea oficială.
          </p>
          <p className="mt-3">
            Plata impozitului calculat se face la termenul afișat de ANAF după validare. Codurile de plată ANAF
            (separate pentru impozit și CASS) sunt afișate în confirmarea declarației.
          </p>
        </Step>
      </Section>

      <Section title="Cum corectezi dacă ai greșit (declarație rectificativă)">
        <p>
          Greșelile se întâmplă. Mai ales prima dată. Soluția este declarația rectificativă: o nouă D212 cu opțiunea
          „Rectificativă" bifată, care înlocuiește pe cea inițială.
        </p>
        <p className="mt-3">Termen: 5 ani fiscali consecutivi (perioada de prescripție). Pentru declarația 2025 depusă în 2026, poți depune rectificativă până în 2031.</p>
        <p className="mt-3">Cum se face:</p>
        <ol className="list-decimal list-outside pl-6 space-y-1 mt-2">
          <li>În SPV, intri din nou la D212 pentru anul fiscal corespunzător.</li>
          <li>Selectezi tipul „Rectificativă".</li>
          <li>Completezi din nou TOATE capitolele cu valorile corecte (sistemul nu prepopulează automat din declarația anterioară).</li>
          <li>Transmiți. Sistemul recalculează diferența.</li>
          <li>Dacă rezultă diferență de plată, plătești diferența. Dacă rezultă o restituire, ceri restituire în secțiunea respectivă.</li>
        </ol>
        <p className="mt-3">
          Avantajul declarării voluntare: penalitățile sunt mai mici decât dacă ANAF descoperă obligații nedeclarate
          la o inspecție.
        </p>
      </Section>

      <Section title="Penalități și ce se întâmplă dacă uiți">
        <p>Toate datele sunt din legislația aplicabilă pentru anul fiscal 2025:</p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Penalitate de întârziere:</strong> 0,01% pe zi din suma datorată.
          </li>
          <li>
            <strong>Dobândă:</strong> 0,02% pe zi din suma datorată.
          </li>
          <li>
            <strong>Penalitate de nedeclarare</strong> (dacă ANAF descoperă singur prin control): 0,08% pe zi
            suplimentar, retroactiv de la data scadenței.
          </li>
          <li>
            <strong>Amendă administrativă:</strong> 50-500 RON pentru persoane fizice care nu depun la termen.
          </li>
          <li>
            <strong>Pentru sume mari nedeclarate</strong> (peste anumite praguri stabilite de Codul Penal),
            potențial răspundere penală pentru evaziune fiscală. Rar la primii pași, dar real ca risc juridic la
            sume importante.
          </li>
        </ul>
        <p className="mt-3 font-medium">
          Dacă ai uitat și au trecut zile peste termen: depui declarația cât mai repede, plătești cu tot cu dobânzi și
          penalități calculate. Mai bine decât să aștepți inspecția.
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>Confuzia între suma scoasă și suma realizată.</strong> Pentru declarație contează ce ai realizat ca
          venit (vânzări, dividende, dobânzi), nu ce ai scos efectiv din cont. Banii rămași pe broker pot fi venit dacă
          provin din vânzări sau dividende.
        </Mistake>
        <Mistake>
          <strong>Cursul greșit pe valută.</strong> Cursul BNR oficial din ZIUA tranzacției, nu cursul brokerului, nu
          cursul mediu anual.
        </Mistake>
        <Mistake>
          <strong>„Am pierdere, nu declar."</strong> Pierderile se declară. Nu plătești impozit pe câștig (n-ai), dar
          beneficiul reportării pe 5 ani fiscali se pierde fără declarație.
        </Mistake>
        <Mistake>
          <strong>Folosirea netului în loc de brut la dividende.</strong> La rubrica dividende treci suma BRUTĂ în RON
          și separat reținerea străină. Sistemul ANAF aplică automat creditul fiscal.
        </Mistake>
        <Mistake>
          <strong>„Am salariu, nu mai datorez CASS pe investiții."</strong> CASS pe non-salariale e separat de cel din
          salariu. Se aplică suplimentar dacă pragurile sunt depășite (24.300 RON, 48.600 RON, 97.200 RON pentru 2025).
        </Mistake>
        <Mistake>
          <strong>Lăsarea pentru ultima zi.</strong> Sistemul ANAF este aglomerat în săptămâna deadline-ului și pot
          apărea blocaje. Plus contul SPV durează zile pentru validare dacă nu îl ai deja.
        </Mistake>
        <Mistake>
          <strong>Netransmiterea declarației după salvare.</strong> Salvarea NU înseamnă depunere. Trebuie explicit să
          apeși „Transmite" și să verifici confirmarea în Mesaje / Documente trimise.
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Calculează cifrele cu InvesTax</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Pentru investitorii la bursă, InvesTax automatizează calculul: introduci sumele tale (sau încarci PDF-ul
              Trading212) și primești cifrele formatate pentru fiecare capitol din D212, în RON, cu cursurile BNR și
              metodologia CMP aplicate. Calculator manual gratuit, plan plătit pentru încărcarea automată a
              extraselor.
            </p>
            <button onClick={() => navigate('/calculator')} className="btn-primary inline-flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Deschide calculatorul
            </button>
          </div>
        </div>
      </section>

      <Section title="Ghiduri pe situații specifice">
        <p>Pentru detalii în funcție de situația ta:</p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <button
              onClick={() => navigate('/ghid/declaratie-unica-trading212')}
              className="text-accent dark:text-accent-light underline hover:no-underline"
            >
              Trading212 în Declarația Unică
            </button>
            : pas cu pas, exemplu numeric, capcane.
          </li>
          <li>
            <button
              onClick={() => navigate('/ghid/declaratie-unica-revolut')}
              className="text-accent dark:text-accent-light underline hover:no-underline"
            >
              Revolut Stocks / Trading în Declarația Unică
            </button>
            : ce raport scoți, cum tratezi dobânzile de la Pockets.
          </li>
          <li>
            <button
              onClick={() => navigate('/ghid/dividende-broker-strain')}
              className="text-accent dark:text-accent-light underline hover:no-underline"
            >
              Dividende de la broker străin
            </button>
            : credit fiscal, ratele pe țară, exemple SUA / UK / NL.
          </li>
          <li>
            <button
              onClick={() => navigate('/ghid/cass-investitii')}
              className="text-accent dark:text-accent-light underline hover:no-underline"
            >
              CASS pentru investitori
            </button>
            : pragurile, ce intră în calcul, exemple.
          </li>
        </ul>
      </Section>

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
          Acest ghid este informativ și acoperă regulile aplicabile pentru anul fiscal 2025 (depus în 2026). Pentru
          situații complexe (PFA + investitor + chiriaș, regimuri fiscale internaționale, sume mari) consultă un
          contabil. ANAF publică ghidul oficial al Declarației Unice anual pe anaf.ro.
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
