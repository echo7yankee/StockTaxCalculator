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
    fullUrl: 'https://investax.app/ghid/cum-completez-declaratia-unica',
  },
  {
    title: 'Cum declar Trading212 în Declarația Unică 2026',
    description:
      'Specific pentru investitorii cu cont Trading212: extragerea raportului fiscal, CMP, conversii BNR, dividende cu credit, exemplu numeric.',
    path: '/ghid/declaratie-unica-trading212',
    fullUrl: 'https://investax.app/ghid/declaratie-unica-trading212',
  },
  {
    title: 'Cum declar Revolut Trading în Declarația Unică 2026',
    description:
      'Pentru investitorii Revolut Stocks / Trading: cum scoți raportul fiscal, capcane (cursul intern Revolut nu se acceptă), dobânzi de la Pockets / Savings.',
    path: '/ghid/declaratie-unica-revolut',
    fullUrl: 'https://investax.app/ghid/declaratie-unica-revolut',
  },
  {
    title: 'Dividende de la broker străin în Declarația Unică 2026',
    description:
      'Mecanica creditului pentru reținerea străină, ratele de impunere pe țară (SUA, UK, Germania, Olanda etc.), exemple lucrate.',
    path: '/ghid/dividende-broker-strain',
    fullUrl: 'https://investax.app/ghid/dividende-broker-strain',
  },
  {
    title: 'CASS pe investiții 2025: praguri, calcul, exemple',
    description:
      'Pragurile de 6, 12, 24 salarii minime, ce venituri intră în calcul (dividende + câștiguri + dobânzi + chirii), 4 exemple concrete.',
    path: '/ghid/cass-investitii',
    fullUrl: 'https://investax.app/ghid/cass-investitii',
  },
];

export const GHID_INDEX_COLLECTION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Ghiduri InvesTax pentru Declarația Unică',
  description:
    'Toate ghidurile InvesTax pentru investitorii la bursă: Trading212, Revolut, dividende de la broker străin, CASS, completarea Declarației Unice.',
  inLanguage: 'ro',
  url: 'https://investax.app/ghid',
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
  url: 'https://investax.app/ghid',
};
