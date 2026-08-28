// Curated options for the setup wizard and the settings page: which language
// TMDB answers in (titles, overviews, genre names) and which country's
// streaming availability scripts/import-imdb.ts uses to guess a platform.
export const LANGUAGES = [
  { value: "en-US", label: "English" },
  { value: "it-IT", label: "Italiano" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pl-PL", label: "Polski" },
  { value: "ru-RU", label: "Русский" },
  { value: "tr-TR", label: "Türkçe" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "zh-CN", label: "中文" },
  { value: "hi-IN", label: "हिन्दी" },
] as const;

export const REGIONS = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "IT", label: "Italy" },
  { value: "ES", label: "Spain" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "BR", label: "Brazil" },
  { value: "PT", label: "Portugal" },
  { value: "NL", label: "Netherlands" },
  { value: "PL", label: "Poland" },
  { value: "RU", label: "Russia" },
  { value: "TR", label: "Turkey" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "CN", label: "China" },
  { value: "IN", label: "India" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "MX", label: "Mexico" },
] as const;

export function isKnownLanguage(value: string): boolean {
  return LANGUAGES.some((l) => l.value === value);
}

export function isKnownRegion(value: string): boolean {
  return REGIONS.some((r) => r.value === value);
}
