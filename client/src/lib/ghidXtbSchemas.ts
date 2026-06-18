export const GHID_XTB_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Trebuie să declar câștigurile de la XTB în Declarația Unică?',
    a: 'Pentru impozitul pe câștig, nu. XTB este sucursala din România a XTB S.A. (Polonia), asimilată unui sediu permanent, deci este intermediar rezident și reține impozitul pe câștiguri direct la sursă, la fiecare tranzacție (în 2025: 1% pentru deținere peste 365 de zile și 3% pentru sub; din 2026 cresc la 3%, respectiv 6%, conform Legii 239/2025). Acest impozit este final, așa că nu îl mai treci în Declarația Unică. Atenție totuși la CASS: aceste câștiguri se iau în calcul la plafonul de contribuție, așa că dacă totalul veniturilor tale din investiții trece de prag (24.300 lei în 2025), tot depui Declarația Unică, dar doar pentru CASS.',
  },
  {
    q: 'Cu ce e diferit XTB față de Trading212, Revolut sau IBKR?',
    a: 'Trading212, Revolut și IBKR sunt brokeri străini fără sediu permanent în România: pentru ei tu calculezi și declari singur câștigul net anual în Declarația Unică (10% în 2025; cota crește din 2026 conform Legii 239/2025, art. 123 din Codul fiscal). XTB are sucursală în România și reține impozitul la sursă, deci pentru impozitul pe câștigurile prin XTB nu mai depui declarație. Sunt regimuri complet diferite, iar confuzia dintre ele este cea mai frecventă greșeală a investitorilor cu mai mulți brokeri.',
  },
  {
    q: 'XTB îmi dă un raport fiscal pentru ANAF?',
    a: 'XTB reține și virează impozitul pe câștiguri în numele tău, deci nu trebuie să recalculezi acele câștiguri pentru ANAF. Platforma îți pune la dispoziție situații și documente cu tranzacțiile și impozitul reținut, utile pentru evidența ta proprie. Diferența practică față de un broker străin este că la XTB nu tu ești cel care depune declarația pentru impozitul pe aceste câștiguri.',
  },
  {
    q: 'Plătesc CASS dacă investesc prin XTB?',
    a: 'CASS (contribuția la sănătate) nu se calculează pe câștigul în sine, ci pe totalul veniturilor tale non-salariale dintr-un an comparat cu praguri fixe: 6, 12 și 24 de salarii minime. Pentru 2025 pragurile sunt 24.300, 48.600 și 97.200 lei. Important: chiar dacă XTB reține impozitul pe câștig la sursă, acele câștiguri se iau în calcul la plafonul de CASS, alături de dividende, dobânzi și celelalte venituri din investiții. Dacă, însumate, trec de primul prag, datorezi CASS și depui Declarația Unică pentru ea, indiferent de brokerul folosit.',
  },
  {
    q: 'Am și dividende prin XTB. Le declar?',
    a: 'Da. Dividendele din acțiuni străine se declară în Declarația Unică, separat de câștigurile din vânzarea acțiunilor, pentru că XTB nu reține impozitul român final pe ele. Pentru 2025 cota este 10%, cu credit fiscal pentru impozitul deja reținut în țara sursă (de exemplu 15% pe dividendele din SUA cu formularul W-8BEN), ca să nu fii impozitat de două ori pe aceeași sumă (art. 131 din Codul fiscal). Această parte rămâne în sarcina ta chiar dacă folosești doar XTB.',
  },
  {
    q: 'Dacă am și Trading212 sau Revolut pe lângă XTB, ce fac?',
    a: 'Pentru impozitul pe câștigurile de la XTB nu faci nimic în Declarația Unică (sunt reținute la sursă). Pentru câștigurile de la Trading212, Revolut sau IBKR declari tu, pe câștigul net anual, la cota anului respectiv. Pe acea parte InvesTax îți face calculul: metoda costului mediu ponderat, cursurile BNR pe data fiecărei tranzacții și pragurile CASS pentru anul fiscal 2025.',
  },
];

export const GHID_XTB_ARTICLE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Impozit pe investiții la XTB: ce declari și ce nu în Declarația Unică',
  datePublished: '2026-06-19',
  author: { '@type': 'Organization', name: 'InvesTax' },
  publisher: {
    '@type': 'Organization',
    name: 'InvesTax',
    url: 'https://investax.app/',
  },
  inLanguage: 'ro',
  mainEntityOfPage: 'https://investax.app/ghid/impozit-xtb/',
};

export const GHID_XTB_FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GHID_XTB_FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export const GHID_XTB_META = {
  title: 'Impozit XTB România: ce declari în Declarația Unică | InvesTax',
  description:
    'XTB are sucursală în România și reține impozitul pe câștiguri la sursă, deci nu depui Declarația Unică pentru impozitul pe ele. Ce îți rămâne totuși de declarat: dividende din străinătate și CASS. Diferența față de Trading212, Revolut și IBKR.',
  url: 'https://investax.app/ghid/impozit-xtb/',
};
