import { DICT } from "@/lib/i18n";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://appseal.online";

const faqPairs = Array.from({ length: 8 }, (_, i) => {
  const n = i + 1;
  const qKey = `faq${n}Q` as keyof typeof DICT;
  const aKey = `faq${n}A` as keyof typeof DICT;
  return { q: DICT[qKey].ru, a: DICT[aKey].ru };
});

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#org`,
      name: "AppSeal",
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/ico.png`,
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#site`,
      url: BASE_URL,
      name: "AppSeal",
      publisher: { "@id": `${BASE_URL}/#org` },
      inLanguage: ["ru", "en"],
    },
    {
      "@type": "SecurityApplication",
      "@id": `${BASE_URL}/#app`,
      name: "AppSeal",
      url: BASE_URL,
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web",
      inLanguage: ["ru", "en"],
      description:
        "Внешний сканер безопасности для приложений, собранных с ИИ: утечки секретов, открытые базы, дырявые админки, признаки заброшенности. Оценка A+-E и бейдж доверия.",
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "RUB",
          url: BASE_URL,
        },
        {
          "@type": "Offer",
          name: "Launch Pass",
          price: "490",
          priceCurrency: "RUB",
          url: `${BASE_URL}/#pricing`,
        },
      ],
      publisher: { "@id": `${BASE_URL}/#org` },
    },
    {
      "@type": "FAQPage",
      "@id": `${BASE_URL}/#faq`,
      mainEntity: faqPairs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
