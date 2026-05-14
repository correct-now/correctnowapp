export type RegionalPricing = {
  regionLabel: string;
  currency: string;
  amount: number;
  stripePriceId?: string;
  useRazorpay?: boolean;
};

export type CreditPackKey = "basic" | "saver" | "ultra";

export type CreditPack = {
  key: CreditPackKey;
  credits: number;
  amount: number;
  label: string;
  highlight?: boolean;
};

const env = import.meta.env as Record<string, string | undefined>;

const SEA = ["SG", "MY", "ID", "PH", "TH", "VN"];
const LATAM = ["BR", "MX", "AR", "CL", "CO", "PE"];
const MIDDLE_EAST = ["AE", "SA", "QA", "KW", "BH", "OM", "IL", "JO"];
const AFRICA = ["NG", "KE", "ZA", "EG", "GH", "TZ", "UG", "MA", "DZ"];
const EUROPE = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "CH",
];

export const resolvePricing = (countryCode: string): RegionalPricing => {
  const code = (countryCode || "").toUpperCase();

  if (code === "IN") {
    return {
      regionLabel: "India",
      currency: "INR",
      amount: 999,
      useRazorpay: true,
    };
  }

  if (code === "JP") {
    return {
      regionLabel: "Japan",
      currency: "JPY",
      amount: 1600,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_JPY_1600,
    };
  }

  if (code === "US" || code === "CA") {
    return {
      regionLabel: "US / Canada",
      currency: "USD",
      amount: 18,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_18,
    };
  }

  if (code === "GB") {
    return {
      regionLabel: "United Kingdom",
      currency: "GBP",
      amount: 14,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_GBP_14,
    };
  }

  if (EUROPE.includes(code)) {
    return {
      regionLabel: "Europe",
      currency: "EUR",
      amount: 16,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_EUR_16,
    };
  }

  if (SEA.includes(code)) {
    return {
      regionLabel: "Southeast Asia",
      currency: "USD",
      amount: 9.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_9_99,
    };
  }

  if (LATAM.includes(code)) {
    return {
      regionLabel: "Latin America",
      currency: "USD",
      amount: 9.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_9_99,
    };
  }

  if (MIDDLE_EAST.includes(code)) {
    return {
      regionLabel: "Middle East",
      currency: "USD",
      amount: 13.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_13_99,
    };
  }

  if (AFRICA.includes(code)) {
    return {
      regionLabel: "Africa",
      currency: "USD",
      amount: 7.99,
      stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_7_99,
    };
  }

  return {
    regionLabel: "Rest of World",
    currency: "USD",
    amount: 11.99,
    stripePriceId: env.VITE_STRIPE_PRICE_ID_USD_11_99,
  };
};

export const formatPrice = (currency: string, amount: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

const CREDIT_PACKS_BY_CURRENCY: Record<string, CreditPack[]> = {
  INR: [
    { key: "basic", credits: 10000, amount: 400, label: "Basic Pack" },
    { key: "saver", credits: 25000, amount: 600, label: "Super Saver" },
    { key: "ultra", credits: 50000, amount: 1000, label: "Ultra Saver", highlight: true },
  ],
  USD: [
    { key: "basic", credits: 10000, amount: 5.99, label: "Basic Pack" },
    { key: "saver", credits: 25000, amount: 9.99, label: "Super Saver" },
    { key: "ultra", credits: 50000, amount: 15.99, label: "Ultra Saver", highlight: true },
  ],
  EUR: [
    { key: "basic", credits: 10000, amount: 5.59, label: "Basic Pack" },
    { key: "saver", credits: 25000, amount: 8.99, label: "Super Saver" },
    { key: "ultra", credits: 50000, amount: 13.99, label: "Ultra Saver", highlight: true },
  ],
  GBP: [
    { key: "basic", credits: 10000, amount: 4.99, label: "Basic Pack" },
    { key: "saver", credits: 25000, amount: 7.99, label: "Super Saver" },
    { key: "ultra", credits: 50000, amount: 12.99, label: "Ultra Saver", highlight: true },
  ],
  JPY: [
    { key: "basic", credits: 10000, amount: 600, label: "Basic Pack" },
    { key: "saver", credits: 25000, amount: 1000, label: "Super Saver" },
    { key: "ultra", credits: 50000, amount: 1600, label: "Ultra Saver", highlight: true },
  ],
};

export const getCreditPacks = (currency: string): CreditPack[] => {
  const key = String(currency || "").toUpperCase();
  return CREDIT_PACKS_BY_CURRENCY[key] ?? CREDIT_PACKS_BY_CURRENCY.USD;
};

export const detectCountryCode = async (): Promise<string> => {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) return "";
    const data = await res.json();
    return String(data?.country || "");
  } catch {
    return "";
  }
};
