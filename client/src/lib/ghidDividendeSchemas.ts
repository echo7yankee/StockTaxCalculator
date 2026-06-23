export const GHID_DIVIDENDE_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Brokerul mi-a reținut deja 30% pe dividend. Mai plătesc ceva în România?',
    a: 'Probabil nu, dar trebuie să declari dividendul. În România datorezi 10% pe brut, dar primești credit pentru reținerea străină, limitat la impozitul român. Dacă ai reținut 30% în SUA fără W-8BEN, creditul tău e limitat tot la 10% (cât ar fi fost impozitul RO). Diferența de 20% e pierdută, dar n-ai de plătit nimic în plus în RO.',
  },
  {
    q: 'Ce e W-8BEN și de ce contează?',
    a: 'W-8BEN este formularul prin care declari brokerului american că ești rezident fiscal într-o țară cu tratat de evitare a dublei impuneri cu SUA. Pentru România, rata redusă conform tratatului este 10% pentru dividende, în loc de 30% rata standard. Trading212 și Revolut îl gestionează intern; verifică în setările contului că este completat.',
  },
  {
    q: 'Pot pierde creditul fiscal dacă nu am documente?',
    a: 'Da. ANAF poate cere certificat de reținere a impozitului străin: 1042-S de la IRS pentru SUA, certificat de la broker pentru alte țări. Fără documente, creditul nu se aplică și plătești 10% pe brutul dividendului fără reducere.',
  },
  {
    q: 'Cum convertesc dividendele primite în USD în RON?',
    a: 'Pentru dividendele primite în valută străină, conversia în RON se face la cursul mediu anual BNR al pieței valutare, comunicat pentru anul în care s-a realizat venitul (Codul Fiscal art. 131 alin. 6), nu la cursul din ziua plății și nu la cursul brokerului. De exemplu, dividende în USD primite în 2025 se convertesc la cursul mediu BNR USD/RON pentru anul 2025 (4,4705 RON/USD). Sursa oficială este bnr.ro, secțiunea cursului mediu anual.',
  },
  {
    q: 'Diferența între cota dividendului și impozitul reținut: cum se reflectă?',
    a: 'Pe extrasul brokerului ai trei cifre: brut (gross), reținut (withholding tax), și net. Pentru declarație folosești BRUT, nu net. Reținerea se trece separat, ca credit fiscal.',
  },
  {
    q: 'Dividendele de la ETF-uri irlandeze (ex. iShares cu sufix .L sau IE) au tratament special?',
    a: 'Da, ETF-urile irlandeze (UCITS) tipic nu rețin impozit pe dividendele plătite către investitori non-irlandezi. Reținerea există la nivelul fondului (când fondul primește dividende de la companii americane), dar la tine nu mai apare reținere. Tu plătești 10% în România pe ce primești.',
  },
  {
    q: 'Cum tratez ETF-urile cu acumulare (accumulating)?',
    a: 'ETF-urile de acumulare NU plătesc dividende către tine. Veniturile sunt reinvestite în fond. Nu ai dividende de declarat, dar când vinzi ETF-ul, câștigul realizat (inclusiv componenta de dividende reinvestite implicit) intră la rubrica de transfer titluri, nu la dividende. Exemple populare: VWCE (Vanguard FTSE All-World, ISIN IE00BK5BQT80), CSPX (iShares Core S&P 500, ISIN IE00B5BMR087), EUNL / IWDA / SWDA (iShares Core MSCI World, ISIN IE00B4L5Y983, listări diferite ale aceluiași fond).',
  },
  {
    q: 'Trebuie să plătesc CASS pe dividende?',
    a: 'Dividendele intră în calculul pragului CASS, alături de celelalte venituri non-salariale (câștiguri broker, chirii, dobânzi). Dacă suma totală depășește 6 salarii minime (24.300 RON pentru 2025), plătești CASS conform pragului în care te încadrezi.',
  },
];

export const GHID_DIVIDENDE_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Dividende de la broker străin în Declarația Unică 2026',
  datePublished: '2026-05-01',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/dividende-broker-strain/',
};

export const GHID_DIVIDENDE_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_DIVIDENDE_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_DIVIDENDE_META = {
  title: 'Calculator impozit dividende broker străin | InvesTax',
  description:
    'Calculator pentru impozitul pe dividende de la broker străin (Trading212, Revolut, IBKR): creditul pentru reținerea străină, ratele pe țară, exemple și FAQ.',
  url: 'https://investax.app/ghid/dividende-broker-strain/',
};
