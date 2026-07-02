export const GHID_NOTIFICARE_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Ce este o notificare de conformare de la ANAF?',
    a: 'Este o scrisoare prin care ANAF îți spune că deține date (de exemplu de la băncile și brokerii din străinătate, prin schimbul automat de informații CRS) care nu se potrivesc cu declarațiile tale și te invită să îți corectezi singur situația în 30 de zile de la primire. Este reglementată de art. 140^1 din Codul de procedură fiscală. Nu este o amendă și nu este o decizie de impunere: în fereastra celor 30 de zile poți depune sau corecta declarațiile fără să fii selectat pentru verificare.',
  },
  {
    q: 'Ce se întâmplă dacă ignor notificarea de conformare?',
    a: 'Dacă termenul de 30 de zile trece fără niciun răspuns, ANAF este obligată să te includă în programul de verificare a situației fiscale personale. Sumele stabilite atunci prin decizie poartă penalitate de nedeclarare de 0,08% pe zi, semnificativ peste accesoriile plătite la corectarea voluntară (dobândă de 0,02% pe zi plus penalitate de întârziere de 0,01% pe zi).',
  },
  {
    q: 'Am avut doar pierderi la broker. Mai trebuie să declar?',
    a: 'Da. Campania ANAF din octombrie 2025 pe veniturile din investiții a subliniat explicit că și pierderile trebuie raportate, nu doar profiturile. Raportarea corectă a pierderii îți păstrează și dreptul de a o compensa cu câștiguri viitoare, după regulile anului în care a fost realizată.',
  },
  {
    q: 'Nu am depus deloc Declarația Unică pentru 2023 sau 2024. Depun rectificativă?',
    a: 'Nu. Rectificativa corectează o declarație deja depusă. Dacă nu ai depus deloc pentru anul respectiv, depui acum declarația inițială, cu întârziere, pe versiunea de formular a anului respectiv. Dacă ai depus dar ai omis venituri, depui declarație rectificativă; formularul actual are inclusiv o căsuță dedicată pentru rectificativa depusă ca urmare a unei notificări de conformare.',
  },
  {
    q: 'Ce cote de impozit se aplică pentru anii 2023 și 2024?',
    a: 'Pentru câștigurile din transferul titlurilor de valoare prin brokeri fără reprezentanță în România (de exemplu Trading 212, Interactive Brokers, Revolut, eToro): 10% pe câștigul net anual, în ambii ani. Pentru dividendele din străinătate încasate în 2023 sau 2024: 8%, nu 10% (cota de 10% se aplică abia dividendelor distribuite după 1 ianuarie 2025). CASS se datorează pe praguri de 6, 12 și 24 de salarii minime: pentru 2023 pragurile sunt 18.000, 36.000 și 72.000 lei; pentru 2024 sunt 19.800, 39.600 și 79.200 lei.',
  },
  {
    q: 'Cum răspund la notificare? Am nevoie de SPV?',
    a: 'Răspunsul la notificare se trimite simplu, prin email la Notificare.VSFP@anaf.ro sau prin poștă; nu ai nevoie de SPV pentru răspuns. Pentru depunerea efectivă a declarațiilor pe anii anteriori folosești PDF-ul inteligent al anului respectiv, descărcat din arhiva oficială ANAF, validat și încărcat prin SPV (formularul online din SPV acoperă doar anul curent).',
  },
  {
    q: 'Cât costă întârzierea pentru un an nedeclarat?',
    a: 'La corectarea voluntară plătești dobândă de 0,02% pe zi și penalitate de întârziere de 0,01% pe zi, calculate la impozitul datorat, de la termenul inițial de plată. Exemplu pur ilustrativ: pentru un impozit de 10.000 lei aferent anului 2023, achitat la mijlocul lui 2026, accesoriile la corectare voluntară sunt în jur de 2.200 lei; dacă aștepți ca ANAF să stabilească sumele prin decizie, penalitatea de nedeclarare de 0,08% pe zi duce totalul accesoriilor spre 3.000 până la 7.500 lei. Calculul exact depinde de datele și sumele tale; cifrele de mai sus sunt un exemplu, nu o estimare pentru cazul tău.',
  },
  {
    q: 'Poate InvesTax să calculeze automat anii 2023 și 2024?',
    a: 'Da. Motorul InvesTax calculează automat anii fiscali 2023, 2024 și 2025, fiecare pe regulile lui: cotele (8% pe dividende pentru 2023 și 2024, 10% pentru 2025), plafoanele CASS ale anului respectiv și conversiile BNR. Poți verifica gratuit extrasul de broker, fără cont și fără plată, ca să vezi întâi dacă îți citim corect tranzacțiile și dividendele. Generarea declarației D212 din fișier este disponibilă pentru anul fiscal 2025; pentru 2023 și 2024 primești cifrele corecte și ghidul de depunere pe formularul anului respectiv.',
  },
];

export const GHID_NOTIFICARE_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Notificare de la ANAF pentru venituri din străinătate: ce faci ca investitor',
  datePublished: '2026-06-12',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/notificare-anaf-venituri-strainatate/',
};

export const GHID_NOTIFICARE_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_NOTIFICARE_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_NOTIFICARE_META = {
  title: 'Notificare ANAF venituri din străinătate: ghid pentru investitori | InvesTax',
  description:
    'Ai primit notificare de conformare de la ANAF pentru venituri din străinătate? Ce înseamnă, cum răspunzi și cum corectezi anii 2023 și 2024 cu rectificativă.',
  url: 'https://investax.app/ghid/notificare-anaf-venituri-strainatate/',
};
