export const GHID_REVOLUT_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Revolut Trading reține impozitul în România?',
    a: 'Nu. Revolut Trading operează prin Revolut Securities Europe UAB (Lituania) și nu are reprezentanță fiscală în România. Tu calculezi câștigurile, dividendele și impozitul, apoi le treci în Declarația Unică.',
  },
  {
    q: 'Care e diferența între Revolut Stocks și Revolut Trading?',
    a: 'Funcțional, sunt aceeași zonă din aplicație, dar produsul a evoluat: Revolut Securities Europe UAB este entitatea care prestează serviciul pentru clienții din UE. Pentru declarare nu contează numele intern, contează că nu există reținere la sursă în România.',
  },
  {
    q: 'Cum scot raportul fiscal din Revolut?',
    a: 'În aplicație: Stocks → meniul cu trei puncte → Statements (sau Documents) → Annual Statement / Tax Statement pentru anul calendaristic 2025. Format PDF sau CSV. Dacă opțiunea nu apare, contactezi suportul prin chat și ceri raportul fiscal anual.',
  },
  {
    q: 'Trebuie să declar dacă am pus doar 100 lei pe Revolut și nu am vândut?',
    a: 'Pentru tranzacții, nu (n-ai realizat câștig). Pentru dividende sau dobânzi primite, da. Suma investită nu contează, contează ce ai realizat ca venit (vânzări, dividende, dobânzi) în 2025.',
  },
  {
    q: 'Convertesc cifrele la cursul Revolut sau la cursul BNR?',
    a: 'BNR. ANAF folosește exclusiv cursul BNR oficial din ziua tranzacției. Cursul de schimb intern al Revolut nu se aplică pentru declarație.',
  },
  {
    q: 'Ce fac cu fracționarele Revolut?',
    a: 'Acțiunile fracționare se declară la fel ca acțiunile întregi. Costul mediu ponderat se calculează pe toate cantitățile, indiferent dacă sunt fracționare sau nu.',
  },
  {
    q: 'Ce se întâmplă dacă am avut și pierderi pe Revolut?',
    a: 'Pierderile se trec în declarație ca sumă negativă. Se compensează cu câștigurile din același an de la alți brokeri fără reprezentanță în România. Pierderea netă rămasă se reportează 5 ani fiscali consecutivi, în limita a 70% din câștigurile nete viitoare.',
  },
  {
    q: 'Dobânzile la cardul Revolut Pockets / Savings se declară?',
    a: 'Da, dobânzile primite în 2025 se declară la rubrica de venituri din dobânzi. Convertești în RON la cursul BNR din ziua plății.',
  },
];

export const GHID_REVOLUT_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cum declar Revolut Trading în Declarația Unică 2026',
  datePublished: '2026-05-01',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/declaratie-unica-revolut',
};

export const GHID_REVOLUT_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_REVOLUT_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_REVOLUT_META = {
  title: 'Cum declar Revolut Trading în Declarația Unică 2026 | InvesTax',
  description:
    'Ghid pentru investitorii Revolut Stocks / Trading: cum declari câștigurile, pierderile și dividendele în Declarația Unică 2026. Pași, exemplu, FAQ. Deadline 25 mai.',
  url: 'https://investax.app/ghid/declaratie-unica-revolut',
};
