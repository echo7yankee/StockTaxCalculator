import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, AlertTriangle, FileText, Calculator } from 'lucide-react';
import {
  GHID_CASS_FAQS as FAQS,
  GHID_CASS_ARTICLE_SCHEMA as articleSchema,
  GHID_CASS_FAQ_SCHEMA as faqSchema,
} from '../lib/ghidCassSchemas';

export default function GhidCassPage() {
  const navigate = useNavigate();

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <Helmet>
        <title>CASS pe investiții 2025: praguri, calcul, exemple | InvesTax</title>
        <meta
          name="description"
          content="Cum se calculează CASS pentru investitorii la bursă: pragurile de 6, 12, 24 salarii minime, ce venituri intră în calcul, exemple, FAQ. Pentru anul fiscal 2025, depus în 2026."
        />
        <link rel="canonical" href="https://investax.app/ghid/cass-investitii" />
        <meta property="og:title" content="CASS pe investiții 2025: praguri, calcul, exemple" />
        <meta
          property="og:description"
          content="Pragurile CASS pentru investitori, ce venituri intră în calcul, exemple concrete. Anul fiscal 2025."
        />
        <meta property="og:url" content="https://investax.app/ghid/cass-investitii" />
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
          CASS pentru investitori în 2025: praguri, calcul, exemple
        </h1>
        <p className="text-base text-gray-600 dark:text-slate-400">
          Pentru anul fiscal 2025, depus până pe 25 mai 2026. Pragurile, baza de calcul și capcanele care prind cei
          mai mulți investitori la prima declarație.
        </p>
      </header>

      <section className="mb-10 p-5 bg-accent/5 dark:bg-accent/10 border-l-4 border-accent rounded-r-xl">
        <h2 className="text-lg font-semibold mb-2">TL;DR</h2>
        <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          CASS este 10% și se plătește separat de impozitul pe venit dacă suma veniturilor tale non-salariale
          depășește 6 salarii minime brute pe an (24.300 RON pentru anul 2025). Suma se calculează pe TOTAL: dividende
          + câștiguri din titluri + dobânzi + chirii + altele. Pragurile sunt fixe (6, 12, 24 salarii minime), iar
          contribuția este 10% aplicat pe pragul atins, nu pe veniturile efective.
        </p>
      </section>

      <Section title="Cine plătește CASS pe veniturile din investiții?">
        <p>
          Orice persoană fizică rezidentă în România care în 2025 a avut venituri non-salariale a căror sumă totală a
          depășit pragul de 6 salarii minime brute pe an. Pragul nu privește o singură sursă, ci suma tuturor
          surselor.
        </p>
        <p className="mt-3">
          CASS-ul reținut deja din salariu (de către angajator) NU te exceptează. CASS pe non-salariale se aplică
          suplimentar dacă pragurile sunt depășite.
        </p>
      </Section>

      <Section title="Pragurile pentru anul fiscal 2025">
        <p>Salariul minim brut pe 2025 = 4.050 RON/lună (Hotărârea de Guvern 1506/2024).</p>
        <div className="my-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-accent">
                <th className="text-left py-2 pr-4 font-semibold">Venit non-salarial anual</th>
                <th className="text-left py-2 pr-4 font-semibold">Bază CASS</th>
                <th className="text-left py-2 font-semibold">CASS de plată (10%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              <tr>
                <td className="py-2 pr-4">Sub 24.300 RON (sub 6 salarii minime)</td>
                <td className="py-2 pr-4">0 RON</td>
                <td className="py-2"><strong>0 RON</strong></td>
              </tr>
              <tr>
                <td className="py-2 pr-4">24.300 - 48.600 RON (6 - 12 salarii)</td>
                <td className="py-2 pr-4">24.300 RON (6 × 4.050)</td>
                <td className="py-2"><strong>2.430 RON</strong></td>
              </tr>
              <tr>
                <td className="py-2 pr-4">48.600 - 97.200 RON (12 - 24 salarii)</td>
                <td className="py-2 pr-4">48.600 RON (12 × 4.050)</td>
                <td className="py-2"><strong>4.860 RON</strong></td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Peste 97.200 RON (peste 24 salarii)</td>
                <td className="py-2 pr-4">97.200 RON (24 × 4.050)</td>
                <td className="py-2"><strong>9.720 RON</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-slate-400 italic">
          Suma de plată este fixă pentru fiecare prag. Nu se aplică 10% pe câștigul tău, ci 10% pe baza de calcul a
          pragului în care te încadrezi.
        </p>
      </Section>

      <Section title="Ce venituri intră în calculul pragului">
        <p>
          La pragul CASS contează SUMA tuturor veniturilor tale non-salariale realizate în 2025. Nu doar cele din
          investiții. Lista uzuală:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-2 mt-3">
          <li>
            <strong>Câștiguri din transferul titlurilor de valoare</strong> (Trading212, Revolut, IBKR, eToro etc.) —
            câștigul brut realizat, nu net pe ansamblul anului.
          </li>
          <li>
            <strong>Dividende</strong> — sumă brută în RON, indiferent de țara emitentului.
          </li>
          <li>
            <strong>Dobânzi</strong> — depozite bancare, conturi de economii, obligațiuni, produse Revolut Pockets /
            Savings, P2P lending.
          </li>
          <li>
            <strong>Venituri din chirii</strong> — venitul brut sau net, în funcție de regimul ales.
          </li>
          <li>
            <strong>Venituri din activități independente</strong> (PFA, drepturi de autor) — netul pentru sistem real,
            sau norma de venit pentru forfetar.
          </li>
          <li>
            <strong>Câștiguri din vânzarea aurului, criptomonedelor, alte active financiare.</strong>
          </li>
          <li>
            <strong>Pensii suplimentare private.</strong>
          </li>
        </ul>
        <p className="mt-3">
          Veniturile salariale nu intră aici. CASS-ul reținut din salariu este o categorie separată și nu reduce
          obligația ta pe non-salariale.
        </p>
      </Section>

      <Section title="Exemple de calcul">
        <Example title="Exemplul 1: investitor mic, sub prag">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Câștig brut Trading212: 8.000 RON</li>
            <li>Dividende primite: 2.500 RON brut</li>
            <li>Dobânzi conturi de economii: 600 RON</li>
            <li>Chirii: 0</li>
          </ul>
          <p className="mt-3">
            Total venituri non-salariale: 11.100 RON. Sub pragul de 24.300 RON. <strong>CASS de plată: 0 RON.</strong>
          </p>
        </Example>

        <Example title="Exemplul 2: pragul al doilea">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Câștig brut Trading212: 28.000 RON</li>
            <li>Dividende: 4.000 RON</li>
            <li>Dobânzi: 1.500 RON</li>
            <li>Chirii: 0</li>
          </ul>
          <p className="mt-3">
            Total: 33.500 RON. Între 24.300 și 48.600 RON, deci în pragul al doilea. Baza de calcul = 24.300 RON.
            <strong> CASS de plată: 10% × 24.300 = 2.430 RON.</strong>
          </p>
          <p className="mt-2 text-sm">
            Important: chiar dacă ai câștigat efectiv 33.500 RON, CASS-ul se calculează pe baza fixă de 24.300 RON, nu
            pe câștigul tău exact.
          </p>
        </Example>

        <Example title="Exemplul 3: chiriaș + investitor">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Câștig brut Trading212: 12.000 RON</li>
            <li>Dividende: 3.000 RON</li>
            <li>Chirii (regim impunere reală, venit net): 36.000 RON</li>
          </ul>
          <p className="mt-3">
            Total: 51.000 RON. Între 48.600 și 97.200 RON, deci pragul al treilea. Baza de calcul = 48.600 RON.
            <strong> CASS de plată: 10% × 48.600 = 4.860 RON.</strong>
          </p>
        </Example>

        <Example title="Exemplul 4: pierdere pe broker, dar dividende mari">
          <ul className="list-disc list-outside pl-6 space-y-1 mt-2">
            <li>Pierdere pe Trading212: −15.000 RON</li>
            <li>Dividende primite: 30.000 RON brut</li>
            <li>Dobânzi: 0</li>
          </ul>
          <p className="mt-3">
            Câștigul net pe broker este negativ, deci nu plătești impozit pe câștig (10%). DAR pragul CASS se
            calculează pe SUMA veniturilor (dividendele intră aici cu suma brută), nu pe câștigul net. Total relevant
            pentru CASS: 30.000 RON. Între 24.300 și 48.600, deci pragul al doilea.
            <strong> CASS de plată: 2.430 RON.</strong>
          </p>
          <p className="mt-2 text-sm italic">
            Cazul ăsta surprinde mulți investitori la prima declarație: pierderea pe partea de tranzacții nu te
            scutește de CASS dacă ai dividende sau dobânzi care depășesc pragul.
          </p>
        </Example>
      </Section>

      <Section title="Excepții și situații speciale">
        <p>
          <strong>Pensionarii.</strong> Pensia sub salariul minim este scutită de CASS pe pensie. Dar pe veniturile
          non-salariale (dividende, chirii) pensionarul aplică CASS la fel ca toți ceilalți, cu aceleași praguri.
        </p>
        <p className="mt-3">
          <strong>Persoanele cu handicap.</strong> Anumite categorii sunt scutite de CASS pe baza certificatului de
          încadrare. Verifică în baza Codului Fiscal art. 154 și consultă-ți contabilul sau ANAF.
        </p>
        <p className="mt-3">
          <strong>PFA-iștii.</strong> CASS-ul de la PFA și cel de la veniturile non-salariale (dividende, chirii) sunt
          evaluate pe surse diferite. Ambele se trec în Declarația Unică. Bază: art. 174 Cod Fiscal.
        </p>
        <p className="mt-3">
          <strong>Cei aflați la studii sau în concediu medical fără salariu.</strong> Studenții cu vârsta sub 26 de
          ani aflați la studii și anumite alte categorii pot fi scutite. Verifică art. 154 din Codul Fiscal pentru
          situația ta exactă.
        </p>
      </Section>

      <Section title="Cum se trece în Declarația Unică">
        <p>
          În D212, CASS-ul se completează la capitolul „Stabilirea contribuției de asigurări sociale de sănătate
          datorate". Acolo bifezi pragul în care te încadrezi. Sistemul ANAF calculează automat suma de plată dacă ai
          completat corect veniturile la celelalte capitole.
        </p>
        <p className="mt-3">
          Plata se face la termenul afișat de ANAF după validarea declarației. De obicei tot 25 mai. CASS-ul are linie
          separată de impozitul pe venit, deci primești două coduri ANAF distincte.
        </p>
      </Section>

      <Section title="Greșeli frecvente">
        <Mistake>
          <strong>„Am pierdere, nu plătesc CASS."</strong> Pragul se calculează pe veniturile BRUTE realizate (vânzări,
          dividende, dobânzi), nu pe câștigul NET. O pierdere pe Trading212 nu anulează dividendele primite când vine
          vorba de prag.
        </Mistake>
        <Mistake>
          <strong>Aplicarea procentului pe câștig, nu pe prag.</strong> Mulți cred că CASS = 10% × câștigul lor. Greșit:
          CASS = 10% × baza pragului în care te încadrezi (24.300, 48.600 sau 97.200 RON). E sumă fixă pe prag.
        </Mistake>
        <Mistake>
          <strong>Ignorarea altor surse non-salariale.</strong> Chirii + dividende + dobânzi se adună. Mulți declară
          dividendele dar uită că au și chirii care duc totalul peste prag.
        </Mistake>
        <Mistake>
          <strong>Confuzia cu CASS-ul de la salariu.</strong> Cei care au CASS reținut din salariu cred uneori că nu
          mai datorează nimic. CASS pe non-salariale e separat, peste, dacă pragurile sunt depășite.
        </Mistake>
        <Mistake>
          <strong>Omiterea dobânzilor.</strong> Dobânzile la conturi de economii și produse de tip Pockets / Savings
          sunt venit non-salarial și intră la prag.
        </Mistake>
      </Section>

      <section className="my-12 p-6 bg-gradient-to-br from-accent/10 to-accent/5 dark:from-accent/20 dark:to-accent/5 border border-accent/20 rounded-xl">
        <div className="flex items-start gap-4">
          <Calculator className="w-8 h-8 text-accent dark:text-accent-light flex-shrink-0 mt-1" />
          <div>
            <h2 className="text-xl font-bold mb-2">Calculator automat</h2>
            <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
              Calculatorul InvesTax aplică pragurile CASS pentru tine: introduci sumele tale de venituri non-salariale
              și primești pragul aplicabil + suma de plată. Funcționează gratuit pentru calculul manual.
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
          Acest ghid este informativ. Pragurile CASS sunt valabile pentru anul fiscal 2025. Pentru cazuri complexe
          (pensionar + investitor, PFA + investitor, scutiri pe handicap) consultă un contabil. ANAF publică ghidul
          oficial al Declarației Unice anual pe anaf.ro.
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
