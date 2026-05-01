export const GHID_DU_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Cine trebuie să depună Declarația Unică în 2026?',
    a: 'Orice persoană fizică rezidentă în România care în 2025 a obținut venituri non-salariale: câștiguri din titluri de valoare (Trading212, Revolut, IBKR), dividende, dobânzi peste pragul scutit, chirii, drepturi de autor, activități independente (PFA). Și cei care vor să declare venituri estimate pentru 2026 (PFA-iști noi, de exemplu).',
  },
  {
    q: 'Care e termenul exact?',
    a: '25 mai 2026 pentru declarația aferentă anului fiscal 2025. Plata impozitului are termen separat afișat de ANAF după validare, de regulă tot 25 mai sau imediat după.',
  },
  {
    q: 'Trebuie să declar dacă am scos doar 200 lei de pe broker în 2025?',
    a: 'Suma scoasă (retrasă) nu contează pentru declarație. Contează ce ai realizat ca venit (vânzări, dividende, dobânzi). Dacă din vânzări brute ai obținut 200 lei și nu ai alte venituri non-salariale, probabil ești sub orice prag de impozit relevant — dar tot trebuie să declari câștigul. Lipsa unei declarații poate atrage amendă, chiar dacă suma datorată e zero.',
  },
  {
    q: 'Pot să fac declarație rectificativă dacă am greșit?',
    a: 'Da. Termenul: 5 ani fiscali consecutivi (perioada de prescripție). Faci o nouă D212 cu opțiunea „Rectificativă" bifată. Plătești diferența dacă rezultă mai mult, sau ceri restituire dacă rezultă mai puțin. Penalitățile pentru declarare voluntar corectată sunt mult mai mici decât cele descoperite la inspecție.',
  },
  {
    q: 'Ce se întâmplă dacă uit deadline-ul?',
    a: 'Penalități de 0,01% pe zi + dobânzi de 0,02% pe zi din suma datorată. Plus posibilă amendă administrativă (50-500 RON pentru persoane fizice, mai mare pentru sume mari). Dacă ANAF descoperă obligații nedeclarate prin control, se aplică penalitate suplimentară de 0,08% pe zi. Tot trebuie să depui declarația, dar plătești și extra.',
  },
  {
    q: 'Trebuie să mă autentific cumva special pe SPV?',
    a: 'Da. Cont SPV pe anaf.ro, validat fie prin Buletin (cu certificat la ghișeu) fie prin IBAN (online, mai rapid). Procesul durează câteva zile pentru validare, deci nu lăsa pentru ultima săptămână înainte de 25 mai.',
  },
  {
    q: 'Pot semna D212 fără semnătură electronică?',
    a: 'În SPV semnezi cu credențialele tale SPV (autentificare digitală). Nu ai nevoie de certificat digital extern (eToken). Sistemul ANAF acceptă semnarea direct în interfață.',
  },
  {
    q: 'Se transmite automat declarația când o salvez?',
    a: 'Nu. Trebuie explicit să selectezi „Transmite" / „Depune" la final. Verifică în secțiunea „Mesaje" sau „Documente trimise" că apare confirmarea de înregistrare.',
  },
];

export const GHID_DU_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cum completez Declarația Unică 2026: ghid complet',
  datePublished: '2026-05-01',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/cum-completez-declaratia-unica',
};

export const GHID_DU_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_DU_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_DU_META = {
  title: 'Cum completez Declarația Unică 2026: ghid complet | InvesTax',
  description:
    'Pas cu pas: SPV, capitolele D212, ce documente îți trebuie, cum corectezi greșelile, cum eviți amenzile. Pentru anul fiscal 2025, depus până pe 25 mai 2026.',
  url: 'https://investax.app/ghid/cum-completez-declaratia-unica',
};
