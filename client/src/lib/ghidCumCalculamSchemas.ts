export const GHID_CUM_CALCULAM_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'De ce folosiți CMP (Cost Mediu Ponderat) și nu FIFO?',
    a: 'Pentru brokeri fără reprezentanță fiscală în România, Codul Fiscal art. 94 împreună cu Norma 18/2023 permit ambele metode (FIFO și Cost Mediu Ponderat) pentru determinarea bazei de cost. Practica retail folosește atât FIFO cât și CMP. InvesTax aplică CMP pentru că este metoda implementată consistent în extrasele fiscale anuale Trading212 și se aplică natural pe poziții deschise în mai multe tranșe. Regula importantă: alege o metodă și aplic-o consistent pe toate vânzările unui instrument.',
  },
  {
    q: 'Ce curs BNR aplicați pentru câștigurile de capital din PDF?',
    a: 'Cursul BNR de la data fiecărei tranzacții, conform Codul Fiscal art. 96 (la fel ca pentru fluxul CSV). Prețul de vânzare al fiecărei poziții se convertește la cursul BNR din ziua execuției, iar dividendele rămân la cursul mediu anual (art. 131 alin. 6). Notă istorică: declarația fondatorului pentru anul 2025, depusă la ANAF prin SPV pe 10 aprilie 2026 (total 28.053 lei), a folosit cursul mediu anual și pentru câștigurile de capital, o simplificare uzuală acceptată la acel moment. Acea depunere rămâne valabilă așa cum a fost depusă, dar nu mai reflectă metoda curentă a InvesTax.',
  },
  {
    q: 'Ce curs BNR aplicați pentru dividende?',
    a: 'Cursul mediu anual BNR pentru anul fiscal în care s-a încasat dividendul, conform Codul Fiscal art. 131 alin. (6). Această regulă este distinctă față de cea pentru transferul titlurilor de valoare (art. 96, curs per-tranzacție). Diferența contează: dividendele primite în 2025 se convertesc la cursul mediu BNR USD/RON 2025 (4,4705 RON/USD), nu la cursul din ziua plății și nu la cursul brokerului.',
  },
  {
    q: 'Cum funcționează creditul pentru reținerea străină pe dividende?',
    a: 'Aplicăm formula: impozit final RO = max(0, 10% × dividend brut RON minus reținere străină în RON). Creditul este limitat la impozitul român (10% pentru anul fiscal 2025), conform Codul Fiscal art. 131. Dacă reținerea străină depășește 10% (de exemplu 30% în SUA fără W-8BEN, sau 15% în Olanda), diferența nu se recuperează în România. Detalii pe țară în ghidul dedicat dividendelor.',
  },
  {
    q: 'Cum calculați CASS?',
    a: 'CASS se calculează pe totalul veniturilor non-salariale (câștiguri din transfer titluri + dividende + dobânzi + chirii etc.), comparat cu pragurile 6 / 12 / 24 salarii minime conform Codul Fiscal art. 170. Pentru anul fiscal 2025, salariul minim este 4.050 RON/lună (HG 1506/2024), deci pragurile sunt 24.300 / 48.600 / 97.200 RON, iar sumele fixe sunt 2.430 / 4.860 / 9.720 RON (10% din pragul în care te încadrezi). InvesTax cumulează automat toate veniturile non-salariale pe care le declari pentru a determina pragul corect.',
  },
  {
    q: 'Cum tratați pierderile?',
    a: 'Pierderea netă anuală din transferul titlurilor de valoare prin brokeri fără reprezentanță în România se reportează 5 ani fiscali consecutivi, în limita a 70% din câștigurile nete viitoare (Codul Fiscal art. 119). Pentru pierderi din străinătate, compensarea se face cu câștiguri de aceeași natură și sursă, pentru fiecare țară în parte. InvesTax aplică reportul automat dacă încarci extrase consecutive în același cont.',
  },
  {
    q: 'Ce extrageți efectiv din PDF-ul Trading212?',
    a: 'Pentru fiecare an fiscal: secțiunile Sell trades (data execuției, cantitate, valoare brută în valută, valută), Buy trades (pentru baza de cost CMP), Dividends (data, instrument, valoare brută, reținere străină), Interest (dobânzi de la conturi de cash) și Distributions (ETF). Cifrele din raportul Overview ale brokerului sunt folosite ca verificare independentă: dacă suma tranzacțiilor extrase nu se potrivește cu Overview, parser-ul afișează un avertisment vizibil înainte de plată.',
  },
  {
    q: 'Ce NU calculează InvesTax?',
    a: 'Câteva limitări curente: (1) FIFO nu este suportat, folosim doar CMP; (2) stock splits nu sunt detectate automat în fluxul CSV, recomandăm fluxul PDF pentru anii cu split-uri (NVDA 10:1 etc.); (3) crypto nu este inclus, modul separat este în roadmap; (4) brokeri români cu sediu permanent în România (Tradeville, XTB Romania) nu sunt suportați. InvesTax acoperă explicit brokerii fără reprezentanță fiscală în RO, unde tu ești obligat să declari direct prin D212.',
  },
];

export const GHID_CUM_CALCULAM_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Cum calculează InvesTax: metodologia explicată',
  datePublished: '2026-05-27',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/cum-calculam/',
};

export const GHID_CUM_CALCULAM_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_CUM_CALCULAM_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_CUM_CALCULAM_META = {
  title: 'Cum calculează InvesTax: metodologia explicată | InvesTax',
  description:
    'Metodologia InvesTax pas cu pas: CMP pentru câștiguri, BNR per-data sau anual după caz, credit fiscal pe dividende, CASS pe praguri. Citate din Codul Fiscal.',
  url: 'https://investax.app/ghid/cum-calculam/',
};
