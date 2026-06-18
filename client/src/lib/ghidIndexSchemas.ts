export interface GhidEntry {
  title: string;
  description: string;
  path: string;
  fullUrl: string;
}

export const GHID_LIST: GhidEntry[] = [
  {
    title: 'Cum completez Declarația Unică 2026: ghid complet',
    description:
      'Pas cu pas pe SPV: ce documente îți trebuie, cum completezi capitolele D212, cum corectezi greșelile, cum eviți penalitățile.',
    path: '/ghid/cum-completez-declaratia-unica',
    fullUrl: 'https://investax.app/ghid/cum-completez-declaratia-unica/',
  },
  {
    title: 'Cum declar Trading212 în Declarația Unică 2026',
    description:
      'Specific pentru investitorii cu cont Trading212: extragerea raportului fiscal, CMP, conversii BNR, dividende cu credit, exemplu numeric.',
    path: '/ghid/declaratie-unica-trading212',
    fullUrl: 'https://investax.app/ghid/declaratie-unica-trading212/',
  },
  {
    title: 'Cum declar Revolut Trading în Declarația Unică 2026',
    description:
      'Pentru investitorii Revolut Stocks / Trading: cum scoți raportul fiscal, capcane (cursul intern Revolut nu se acceptă), dobânzi de la Pockets / Savings.',
    path: '/ghid/declaratie-unica-revolut',
    fullUrl: 'https://investax.app/ghid/declaratie-unica-revolut/',
  },
  {
    title: 'Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026',
    description:
      'Pentru investitorii cu cont IBKR: ce extras scoți (Activity Statement în CSV, nu Flex Query), ce este acoperit în beta, cum declari câștigurile și dividendele.',
    path: '/ghid/declaratie-unica-ibkr',
    fullUrl: 'https://investax.app/ghid/declaratie-unica-ibkr/',
  },
  {
    title: 'Dividende de la broker străin în Declarația Unică 2026',
    description:
      'Mecanica creditului pentru reținerea străină, ratele de impunere pe țară (SUA, UK, Germania, Olanda etc.), exemple lucrate.',
    path: '/ghid/dividende-broker-strain',
    fullUrl: 'https://investax.app/ghid/dividende-broker-strain/',
  },
  {
    title: 'CASS pe investiții 2025: praguri, calcul, exemple',
    description:
      'Pragurile de 6, 12, 24 salarii minime, ce venituri intră în calcul (dividende + câștiguri + dobânzi + chirii), 4 exemple concrete.',
    path: '/ghid/cass-investitii',
    fullUrl: 'https://investax.app/ghid/cass-investitii/',
  },
  {
    title: 'Cum calculează InvesTax: metodologia explicată',
    description:
      'Metodologia InvesTax pas cu pas: CMP, cursuri BNR (per-data sau anual, după regulă), credit fiscal pe dividende, CASS, raportare pierderi. Citate exacte din Codul Fiscal.',
    path: '/ghid/cum-calculam',
    fullUrl: 'https://investax.app/ghid/cum-calculam/',
  },
  {
    title: 'Notificare ANAF pentru venituri din străinătate: ghidul investitorului',
    description:
      'Ai primit o notificare de conformare pentru venituri nedeclarate de la brokeri străini? Ce înseamnă, în cât timp răspunzi, cum corectezi anii 2023 și 2024: rectificativă, cote pe ani, CASS, accesorii.',
    path: '/ghid/notificare-anaf-venituri-strainatate',
    fullUrl: 'https://investax.app/ghid/notificare-anaf-venituri-strainatate/',
  },
  {
    title: 'Impozit pe investiții la XTB: ce declari și ce nu',
    description:
      'XTB are sucursală în România și reține impozitul pe câștiguri la sursă, deci pentru ele nu depui Declarația Unică. Ce îți rămâne de declarat (dividende, CASS) și cum diferă de Trading212, Revolut și IBKR.',
    path: '/ghid/impozit-xtb',
    fullUrl: 'https://investax.app/ghid/impozit-xtb/',
  },
];

/**
 * Topic-cluster interlinking for the "Ghiduri conexe" (related guides) section on each
 * spoke page. Keyed by the guide's `path`; the value is the ordered list of related guide
 * paths to surface. Curated by topic relevance (not auto-generated):
 *  - broker guides (T212 / Revolut / IBKR) point to the shared concept guides
 *    (general D212 process, methodology, dividends, CASS), not to each other;
 *  - the dividends guide names all three brokers, so it points back to them;
 *  - the general D212 guide is the broker-selection hub, so it points to every broker.
 * Every referenced path must exist in GHID_LIST (guarded by a unit test).
 */
export const GHID_RELATED: Record<string, string[]> = {
  '/ghid/cum-completez-declaratia-unica': [
    '/ghid/declaratie-unica-trading212',
    '/ghid/declaratie-unica-revolut',
    '/ghid/declaratie-unica-ibkr',
    '/ghid/cum-calculam',
    '/ghid/notificare-anaf-venituri-strainatate',
  ],
  '/ghid/declaratie-unica-trading212': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/cum-calculam',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
    '/ghid/impozit-xtb',
  ],
  '/ghid/declaratie-unica-revolut': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/cum-calculam',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
  ],
  '/ghid/declaratie-unica-ibkr': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/cum-calculam',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
    '/ghid/impozit-xtb',
  ],
  '/ghid/dividende-broker-strain': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/declaratie-unica-trading212',
    '/ghid/declaratie-unica-revolut',
    '/ghid/declaratie-unica-ibkr',
  ],
  '/ghid/cass-investitii': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/dividende-broker-strain',
    '/ghid/cum-calculam',
    '/ghid/declaratie-unica-trading212',
  ],
  '/ghid/cum-calculam': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/declaratie-unica-trading212',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
  ],
  '/ghid/notificare-anaf-venituri-strainatate': [
    '/ghid/cum-completez-declaratia-unica',
    '/ghid/declaratie-unica-trading212',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
  ],
  '/ghid/impozit-xtb': [
    '/ghid/declaratie-unica-trading212',
    '/ghid/dividende-broker-strain',
    '/ghid/cass-investitii',
    '/ghid/cum-completez-declaratia-unica',
  ],
};

export const GHID_INDEX_COLLECTION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Ghiduri InvesTax pentru Declarația Unică',
  description:
    'Toate ghidurile InvesTax pentru investitorii la bursă: Trading212, Revolut, dividende de la broker străin, CASS, completarea Declarației Unice.',
  inLanguage: 'ro',
  url: 'https://investax.app/ghid/',
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: GHID_LIST.length,
    itemListElement: GHID_LIST.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: g.fullUrl,
      name: g.title,
    })),
  },
};

export const GHID_INDEX_META = {
  title: 'Ghiduri Declarația Unică pentru investitori | InvesTax',
  description:
    'Toate ghidurile InvesTax pentru investitorii retail: Trading212, Revolut, dividende, CASS, completarea D212. Pentru anul fiscal 2025, depus în 2026.',
  url: 'https://investax.app/ghid/',
};
