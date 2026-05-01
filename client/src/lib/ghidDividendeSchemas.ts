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
    a: 'Cursul BNR oficial din ZIUA primirii dividendului (ex-date sau data plății, în funcție de sursă), nu cursul brokerului și nu cursul mediu anual. Sursa cea mai practică pentru istoric: cursbnr.ro.',
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
    a: 'ETF-urile de acumulare (ex. CSPX, VWCE) NU plătesc dividende către tine. Veniturile sunt reinvestite în fond. Nu ai dividende de declarat, dar când vinzi ETF-ul, câștigul realizat (inclusiv componenta de dividende reinvestite implicit) intră la rubrica de transfer titluri, nu la dividende.',
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
  mainEntityOfPage: 'https://investax.app/ghid/dividende-broker-strain',
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
  title: 'Dividende de la broker străin în Declarația Unică 2026 | InvesTax',
  description:
    'Cum declari dividendele primite de la Trading212, Revolut, IBKR, eToro: rata în RO, creditul pentru reținerea străină, ratele pe țară (SUA, UK, IE, NL), exemple, FAQ.',
  url: 'https://investax.app/ghid/dividende-broker-strain',
};
