export const GHID_T212_FAQS: Array<{ q: string; a: string }> = [
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

export const GHID_T212_ARTICLE_SCHEMA = {
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

export const GHID_T212_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_T212_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_T212_META = {
  title: 'Cum declar Trading212 în Declarația Unică 2026 | InvesTax',
  description:
    'Ghid complet: cum declari câștigurile, pierderile și dividendele de la Trading212 în Declarația Unică 2026. Pași, exemplu lucrat, greșeli frecvente, FAQ. Deadline 25 mai.',
  url: 'https://investax.app/ghid/declaratie-unica-trading212',
};
