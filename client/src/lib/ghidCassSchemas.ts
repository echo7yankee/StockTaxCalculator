export const GHID_CASS_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Plătesc CASS dacă am salariu și deja mi se reține din salariu?',
    a: 'Da, CASS pe veniturile non-salariale este separat de cel din salariu. Se aplică suplimentar dacă suma veniturilor tale non-salariale (dividende, câștiguri din titluri, chirii, dobânzi etc.) depășește pragurile.',
  },
  {
    q: 'Am avut pierdere netă pe Trading212 / Revolut. Mai datorez CASS?',
    a: 'Posibil, da. Pragul CASS se calculează pe SUMA veniturilor non-salariale, nu pe câștigul net. Dividendele și dobânzile primite intră în calcul chiar dacă ai pierdere pe partea de tranzacții.',
  },
  {
    q: 'Care e baza de calcul pentru CASS în 2025?',
    a: 'Salariul minim brut a fost 4.050 RON/lună în 2025 (Hotărârea de Guvern 1506/2024). Pragul de 6 salarii minime = 24.300 RON pe an. Pragul de 12 = 48.600 RON. Pragul de 24 = 97.200 RON.',
  },
  {
    q: 'Cum se calculează concret CASS dacă sunt pe pragul al doilea?',
    a: 'Indiferent câștigul tău exact, CASS se aplică pe pragul corespunzător. Exemplu: ai 50.000 RON venituri non-salariale, ești între 12 și 24 salarii minime. CASS = 10% × 48.600 RON = 4.860 RON.',
  },
  {
    q: 'Pensionar fiind, datorez CASS pe investiții?',
    a: 'Pensionarii cu pensia sub 4.050 RON/lună sunt scutiți de CASS pe pensie, dar nu și pe veniturile non-salariale. Dacă ai dividende sau câștiguri care depășesc pragurile, aplici CASS la fel ca toți ceilalți.',
  },
  {
    q: 'PFA fiind, cum se combină CASS-ul de la PFA cu cel de la investiții?',
    a: 'CASS-ul plătit pentru PFA și cel pentru veniturile non-salariale (investiții, chirii, dividende) sunt evaluate pe surse diferite. Ambele se trec în Declarația Unică, fiecare cu pragul lui. Detalii la contabilul PFA-ului tău.',
  },
  {
    q: 'CASS se aplică doar pe câștigul realizat sau și pe sumele neretrase?',
    a: 'Doar pe veniturile realizate efectiv în 2025: vânzări (câștig brut), dividende primite, dobânzi încasate. Acțiunile pe care doar le deții nu generează venit, deci nu intră în calcul CASS.',
  },
  {
    q: 'Dacă încadrarea mea pe prag se schimbă în timpul anului, ce fac?',
    a: 'Pragurile se calculează pe totalul anului fiscal. Conturi tale finale (ce treci în D212 depusă în 2026) sunt cele care contează, nu situația dintr-o lună anume.',
  },
];

export const GHID_CASS_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'CASS pe investiții 2025: praguri, calcul, exemple',
  datePublished: '2026-05-01',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/cass-investitii',
};

export const GHID_CASS_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_CASS_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_CASS_META = {
  title: 'CASS pe investiții 2025: praguri, calcul, exemple | InvesTax',
  description:
    'Cum se calculează CASS pentru investitorii la bursă: pragurile de 6, 12, 24 salarii minime, ce venituri intră în calcul, exemple, FAQ. Pentru anul fiscal 2025, depus în 2026.',
  url: 'https://investax.app/ghid/cass-investitii',
};
