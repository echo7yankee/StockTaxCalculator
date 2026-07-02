import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, Calculator, FileSearch, FileText, ShieldAlert } from 'lucide-react';
import {
  GHID_NOTIFICARE_FAQS as FAQS,
  GHID_NOTIFICARE_ARTICLE_SCHEMA as articleSchema,
  GHID_NOTIFICARE_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidNotificareAnafSchemas';
import GhidRelatedGuides from '../components/common/GhidRelatedGuides';

export default function GhidNotificareAnafPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>Notificare ANAF venituri din străinătate: ghid pentru investitori | InvesTax</title>
        <meta
          name="description"
          content="Ai primit notificare de conformare de la ANAF pentru venituri din străinătate? Ce înseamnă, cum răspunzi și cum corectezi anii 2023 și 2024 cu rectificativă."
        />
        <link rel="canonical" href="https://investax.app/ghid/notificare-anaf-venituri-strainatate/" />
        <meta property="og:title" content="Notificare ANAF pentru venituri din străinătate: ghidul investitorului" />
        <meta
          property="og:description"
          content="Ce înseamnă notificarea de conformare, în cât timp răspunzi și cum corectezi anii 2023 și 2024: rectificativă, cote pe ani, CASS, accesorii."
        />
        <meta property="og:url" content="https://investax.app/ghid/notificare-anaf-venituri-strainatate/" />
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
          Notificare de la ANAF pentru venituri din străinătate: ce faci ca investitor
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          ANAF primește automat date despre conturile tale de la băncile și brokerii din străinătate și trimite valuri
          de notificări de conformare. Ce înseamnă scrisoarea, ce termene ai și cum corectezi anii 2023 și 2024.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          Notificarea de conformare nu este o amendă și nu este o decizie de impunere. Este invitația ANAF să îți
          corectezi singur situația în <strong>30 de zile</strong>: depui sau rectifici declarațiile pentru anii vizați
          și răspunzi la notificare (un email simplu, fără SPV). Regula de bază: corectarea voluntară costă mai puțin
          decât sumele stabilite de ANAF prin decizie. Iar regulile fiecărui an diferă: pentru 2023 și 2024 dividendele
          se impozitează cu <strong>8%</strong>, nu 10%, iar plafoanele CASS sunt mai mici decât cele de azi.
        </p>
        <p className="mt-3 text-sm">
          <Link
            to="/verifica-extras"
            className="text-accent dark:text-accent-light font-medium underline hover:no-underline"
          >
            InvesTax calculează acum automat anii 2023 și 2024. Verifică gratuit extrasul →
          </Link>
        </p>
      </section>

      <Section title="Ce este notificarea de conformare">
        <p>
          Notificarea de conformare este pasul formal dinaintea unei verificări: ANAF îți comunică în scris că datele
          pe care le deține nu se potrivesc cu ce ai declarat (sau cu ce nu ai declarat deloc) și îți dă{' '}
          <strong>30 de zile de la primire</strong> ca să îți corectezi singur situația. Mecanismul este reglementat de
          art. 140^1 din Codul de procedură fiscală.
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>În fereastra de 30 de zile nu ești selectat pentru verificare.</strong> Exact pentru asta există
            termenul: să apuci să depui sau să corectezi declarațiile din proprie inițiativă.
          </li>
          <li>
            <strong>Răspunsul la notificare nu cere SPV.</strong> Se trimite prin email la{' '}
            <strong>Notificare.VSFP@anaf.ro</strong> sau prin poștă. Depunerea declarațiilor propriu-zise rămâne pe
            canalele obișnuite (vezi pașii de mai jos).
          </li>
          <li>
            <strong>Dacă ignori notificarea</strong>, includerea în programul de verificare a situației fiscale
            personale devine obligatorie, iar sumele stabilite atunci prin decizie poartă penalitate de nedeclarare de
            0,08% pe zi.
          </li>
          <li>
            Formularul D212 actual are o căsuță dedicată:{' '}
            <em>declarație rectificativă depusă ca urmare a unei notificări de conformare</em>. ANAF se așteaptă, deci,
            la exact acest traseu.
          </li>
        </ul>
      </Section>

      <Section title="De ce ai primit-o tocmai acum">
        <p>
          Prin schimbul automat de informații (CRS), băncile și brokerii din străinătate raportează anual conturile
          rezidenților români, iar ANAF împerechează datele cu declarațiile depuse. Campaniile pe veniturile din
          străinătate rulează din 2023 încoace, la scară mare: <strong>24.114 notificări de conformare în 2023</strong>{' '}
          și <strong>19.061 în 2024</strong>, pe toate tipurile de venit.
        </p>
        <p>
          În <strong>octombrie 2025</strong> a urmat o campanie țintită exact pe veniturile din investiții, care a
          mers înapoi până la anul 2019 și a numit explicit platformele <strong>eToro, Interactive Brokers, Trading
          212 și Revolut</strong>. Mesajul ANAF din acea campanie merită reținut: <strong>inclusiv pierderile trebuie
          raportate</strong>, nu doar profiturile.
        </p>
        <p>
          Printre indicatorii de risc folosiți la selecție se numără creșterea soldurilor bancare din țară și din
          străinătate și, poate surprinzător, pierderile raportate din transferul titlurilor de valoare: și cine
          raportează doar pierderi poate primi scrisoarea.
        </p>
      </Section>

      <Section title="Ce ai de făcut, pas cu pas">
        <ol className="list-decimal list-outside pl-6 space-y-2 mt-1">
          <li>
            <strong>Citește exact ce ani și ce venituri vizează scrisoarea.</strong> Notificarea spune ce nepotriviri a
            găsit ANAF și pentru ce perioade.
          </li>
          <li>
            <strong>Reconstituie istoricul de la broker.</strong> Descarcă extrasele complete pentru anii vizați
            (tranzacții, dividende, rețineri la sursă). Toate platformele mari păstrează istoricul descărcabil.
            Înainte de orice, poți{' '}
            <Link
              to="/verifica-extras"
              className="text-accent dark:text-accent-light font-medium underline hover:no-underline"
            >
              verifica gratuit extrasul
            </Link>{' '}
            de broker (Trading 212, Revolut sau IBKR), fără cont și fără plată: vezi dacă îți putem citi corect
            tranzacțiile și dividendele.
          </li>
          <li>
            <strong>Recalculează pe regulile anului respectiv</strong>, nu pe cele de azi. Cotele, plafoanele CASS și
            termenele diferă pe ani (secțiunea următoare).
          </li>
          <li>
            <strong>Alege corect tipul declarației.</strong> Ai depus D212 pentru anul respectiv și ai omis venituri:
            depui <strong>declarație rectificativă</strong> și bifezi căsuța aferentă notificării. Nu ai depus deloc:
            depui <strong>declarația inițială</strong>, cu întârziere; nu este o rectificativă.
          </li>
          <li>
            <strong>Folosește versiunea de formular a anului respectiv.</strong> ANAF păstrează fiecare sezon în arhiva
            oficială a Declarației Unice (PDF inteligent, validator, instrucțiuni): venitul din 2023 se declară pe
            formularul sezonului 2024, venitul din 2024 pe cel al sezonului 2025. PDF-ul validat se încarcă prin SPV;
            formularul online din SPV acoperă doar anul curent.
          </li>
          <li>
            <strong>Răspunde la notificare în termenul de 30 de zile</strong>, prin email la Notificare.VSFP@anaf.ro
            sau prin poștă, menționând ce ai depus și ce ai corectat.
          </li>
        </ol>
      </Section>

      <Section title="2023 și 2024 nu se calculează ca 2025">
        <p>
          Cea mai frecventă greșeală la regularizarea anilor trecuți este aplicarea regulilor de azi pe veniturile de
          atunci. Diferențele care contează pentru un investitor la brokeri străini:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Câștigurile din transferul titlurilor de valoare: 10%</strong> pe câștigul net anual, în ambii ani,
            la fel ca pentru 2025 (brokeri fără reprezentanță în România).
          </li>
          <li>
            <strong>Dividendele din străinătate încasate în 2023 sau 2024: 8%, nu 10%.</strong> Cota a crescut de la 5%
            la 8% pentru dividendele distribuite începând cu 1 ianuarie 2023 (OG 16/2022) și abia la 10% pentru cele
            distribuite după 1 ianuarie 2025 (OUG 156/2024). Creditul fiscal pentru impozitul reținut în țara sursă a
            funcționat la fel în toți acești ani.
          </li>
          <li>
            <strong>Plafoanele CASS au fost mai mici.</strong> Pentru 2023 (salariu minim 3.000 lei): praguri de{' '}
            <strong>18.000 / 36.000 / 72.000 lei</strong>, cu CASS de 1.800 / 3.600 / 7.200 lei. Pentru 2024 (salariu
            minim 3.300 lei): praguri de <strong>19.800 / 39.600 / 79.200 lei</strong>, cu CASS de 1.980 / 3.960 /
            7.920 lei. Majorarea salariului minim din iulie 2024 nu a schimbat pragurile. Notă pentru PFA: din 2024,
            veniturile din activități independente au plafon CASS propriu și nu se mai cumulează cu cele din investiții;
            pentru 2023 se cumulau.
          </li>
          <li>
            <strong>Conversia valutară urmează aceleași reguli ca azi:</strong> câștigurile se convertesc la cursul BNR
            din data fiecărei tranzacții, dividendele la cursul mediu anual BNR al anului în care au fost încasate.
          </li>
          <li>
            <strong>Termenele au fost 27 mai 2024</strong> (pentru veniturile din 2023) <strong>și 26 mai 2025</strong>{' '}
            (pentru 2024); în ambii ani, 25 mai a picat în weekend. Nu s-au acordat bonificații pentru depunere
            anticipată în niciunul dintre cele două cicluri.
          </li>
        </ul>
        <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Acest ghid acoperă anii 2023 și 2024.</strong> Pentru 2022 și anii anteriori, metoda de calcul al
              costului diferă (regulile actuale ale costului mediu ponderat se aplică din 2023), deci nu extrapola
              cifrele de aici la ani mai vechi.
            </span>
          </p>
        </div>
      </Section>

      <Section title="Cât costă întârzierea">
        <p>
          Accesoriile depind de cine stabilește sumele. Dacă <strong>te corectezi singur</strong> (declari și
          plătești), datorezi dobândă de <strong>0,02% pe zi</strong> plus penalitate de întârziere de{' '}
          <strong>0,01% pe zi</strong>, calculate de la termenul inițial de plată al anului respectiv. Dacă{' '}
          <strong>aștepți decizia ANAF</strong>, sumele stabilite de inspecție poartă în loc de penalitatea de
          întârziere o <strong>penalitate de nedeclarare de 0,08% pe zi</strong> (reductibilă cu 75% dacă plătești în
          termenul din decizie).
        </p>
        <p>
          <strong>Exemplu pur ilustrativ</strong>, ca să vezi ordinul de mărime: un impozit de 10.000 lei aferent
          anului 2023, achitat voluntar la mijlocul lui 2026, adună în jur de 2.200 lei accesorii. Aceleași sume
          stabilite prin decizie ANAF ajung, cu tot cu penalitatea de nedeclarare, undeva între aproximativ 3.000 și
          7.500 lei. Calculul exact depinde de datele și sumele tale; cifrele de mai sus sunt un exemplu, nu o
          estimare pentru cazul tău, iar accesoriile finale le stabilește ANAF.
        </p>
        <p>
          Concluzia practică e simplă și nu ține de interpretare: la aceleași sume, corectarea voluntară înainte de
          decizie costă mai puțin decât stabilirea lor de către ANAF.
        </p>
      </Section>

      <Section title="Până când poate ANAF să verifice anii trecuți">
        <p>
          Dreptul ANAF de a stabili obligații fiscale se prescrie în <strong>5 ani de la 1 iulie a anului următor</strong>{' '}
          celui pentru care se datora declarația (art. 110 Cod procedură fiscală). Pentru veniturile din 2023, termenul
          curge până la mijlocul lui 2029; pentru 2024, până la mijlocul lui 2030. Ambii ani sunt deci confortabil în
          interiorul ferestrei de verificare.
        </p>
        <p>
          Două lucruri de știut înainte să te gândești la „aștept să treacă timpul": depunerea unei declarații{' '}
          <strong>întrerupe prescripția</strong>, iar la data publicării acestui ghid (iunie 2026) <strong>nu există
          nicio amnistie fiscală activă</strong> pentru persoane fizice; fereastra OUG 107/2024 s-a închis în decembrie
          2024. A aștepta expirarea termenelor nu este o strategie pe care să ne-o asumăm sau să ți-o recomandăm.
        </p>
      </Section>

      <section id="calcul-automat" className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl scroll-mt-24">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Pentru 2023, 2024 și 2025, calculul e deja automat</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              InvesTax aplică automat metoda CMP, cursurile BNR, cota de dividende și pragurile CASS pentru fiecare an
              în parte: 8% pe dividende pentru 2023 și 2024, 10% pentru 2025, cu plafoanele CASS ale anului respectiv.
              Începe cu verificarea gratuită a extrasului: vezi în câteva secunde dacă îți putem citi corect extrasul
              de broker, fără cont și fără plată. Dacă totul e în regulă, încarci extrasul și primești declarația
              completată, iar calculatorul manual rămâne gratuit pentru estimări rapide.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/verifica-extras" className="btn-primary inline-flex items-center gap-2">
                <FileSearch className="w-4 h-4" />
                Verifică extrasul gratuit
              </Link>
              <Link to="/pricing/" className="btn-secondary inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Încarcă extrasul (2023-2025)
              </Link>
              <Link to="/calculator/" className="btn-secondary inline-flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator gratuit (manual)
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
          Nu îți putem evalua scrisoarea sau situația specifică și nu putem promite niciun rezultat în relația ta cu
          ANAF. InvesTax este un instrument software, nu consultanță fiscală personalizată. Pentru sume mari, mai mulți
          ani nedeclarați sau venituri din surse multiple, discută cu un consultant fiscal sau cu un contabil înainte
          să depui.
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

      <GhidRelatedGuides currentPath="/ghid/notificare-anaf-venituri-strainatate/" />

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
          Acest ghid este informativ și descrie regulile generale aplicabile veniturilor din anii fiscali 2023 și 2024,
          așa cum erau în vigoare în anii respectivi. Nu reprezintă consultanță fiscală personalizată. ANAF publică
          ghidurile oficiale ale Declarației Unice pe anaf.ro.
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
