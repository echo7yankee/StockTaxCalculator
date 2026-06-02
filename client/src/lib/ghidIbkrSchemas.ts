export const GHID_IBKR_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Ce format de extras de la Interactive Brokers acceptă InvesTax?',
    a: 'Activity Statement în format CSV, descărcat din Client Portal: Performance & Reports → Statements → Activity → alegi anul fiscal complet → format CSV. NU folosi Flex Query (acela are altă structură, cu denumiri de câmpuri diferite) și nici extrasul PDF.',
  },
  {
    q: 'Interactive Brokers reține impozitul pe câștiguri pentru ANAF?',
    a: 'Nu. IBKR nu are sediu permanent în România, deci nu reține impozitul la sursă pe câștigurile din tranzacții. Tu calculezi și declari singur câștigul net în Declarația Unică, depusă pe portalul ANAF SPV. Pe dividendele din acțiuni străine se reține un impozit în țara sursă, pentru care primești credit fiscal în România.',
  },
  {
    q: 'De ce este IBKR marcat ca beta în InvesTax?',
    a: 'Parserul IBKR este construit pe formatul publicat al Activity Statement-ului, dar încă nu am validat suficiente extrase reale de la utilizatori. Până confirmăm cel puțin 3 extrase reale care se procesează corect, rămâne în beta: verifică întotdeauna cifrele față de extrasul tău înainte să depui declarația.',
  },
  {
    q: 'Primesc de la IBKR un formular fiscal pentru România?',
    a: 'Nu. IBKR emite documente fiscale pentru SUA (de exemplu 1042-S pentru reținerea pe dividende), dar nu un formular pentru ANAF. Pentru Declarația Unică folosești Activity Statement-ul și faci tu calculele în RON.',
  },
  {
    q: 'De ce diferă totalul calculat de InvesTax de Realized P/L afișat de IBKR?',
    a: 'IBKR își calculează profitul realizat pe metoda FIFO (primul cumpărat, primul vândut). InvesTax recalculează din tranzacțiile brute pe metoda Costului Mediu Ponderat (CMP). Ambele metode sunt acceptate în practica retail; important este să aplici una consistent. Detalii în ghidul de metodologie (/ghid/cum-calculam).',
  },
  {
    q: 'Ce instrumente sunt suportate în beta?',
    a: 'Acțiuni și ETF-uri, în valutele USD, EUR, GBP și RON. Opțiunile, futures, forex, obligațiunile și CFD-urile sunt momentan ignorate, cu un avertisment afișat, ca să nu raportăm un număr greșit. Pentru un portofoliu cu astfel de instrumente, calculează-le separat.',
  },
  {
    q: 'Pot folosi Flex Query în loc de Activity Statement?',
    a: 'Momentan nu. Flex Query este un raport configurabil, cu altă structură și denumiri de câmpuri (camelCase), pe care InvesTax nu îl citește încă. Folosește Activity Statement-ul standard exportat ca CSV.',
  },
  {
    q: 'Ce diferență este între IBKR și XTB la declarare?',
    a: 'XTB are sucursală în România și reține impozitul la sursă (în 2025: 1% pe profit pentru deținere peste 365 de zile și 3% pentru sub; din 2026 cotele cresc la 3%, respectiv 6%). Pentru tranzacțiile XTB nu mai declari profitul. IBKR nu are reprezentanță în România, deci tu calculezi și declari totul, la fel ca la Trading212.',
  },
];

export const GHID_IBKR_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026',
  datePublished: '2026-05-29',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/declaratie-unica-ibkr/',
};

export const GHID_IBKR_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_IBKR_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_IBKR_META = {
  title: 'Cum declar Interactive Brokers (IBKR) în Declarația Unică 2026 | InvesTax',
  description:
    'Ghid pentru investitorii cu cont Interactive Brokers (IBKR): cum scoți extrasul Activity Statement în format CSV, cum declari câștigurile și dividendele în Declarația Unică 2026. Deadline 25 mai.',
  url: 'https://investax.app/ghid/declaratie-unica-ibkr/',
};
