import { normalizeTitle } from "@/lib/title-key";

export type SemanticSearchTitle = {
  id: number;
  title: string;
  searchTitle: string;
  overview: string | null;
  genres: string | null;
  mediaType: string;
  platform: string;
  year: number | null;
  lastWatchedAt: Date | null;
};

type Concept = {
  query: string[];
  evidence: string[];
  genres?: string[];
};

// Small, inspectable concept groups rather than an opaque remote model. They
// bridge the words people use for a mood or setting with the words TMDB tends
// to put in genres and summaries, in both supported UI/content languages.
const CONCEPTS: Concept[] = [
  {
    query: ["malinconico", "malinconici", "malinconica", "triste", "sad", "melancholy", "melancholic"],
    evidence: ["malincon", "nostalg", "solitud", "lutto", "perdita", "dolore", "triste", "lonely", "grief", "loss", "sorrow"],
  },
  {
    query: ["spazio", "spaziale", "space", "cosmo", "cosmic"],
    evidence: ["spazio", "spazial", "astronaut", "cosmo", "pianeta", "galass", "orbita", "alien", "space", "planet", "galaxy"],
    genres: ["science fiction", "sci-fi", "fantascienza"],
  },
  {
    query: [
      "commedia", "commedie", "divertente", "divertenti", "ridere", "comico", "comica", "funny", "comedy",
    ],
    evidence: ["divert", "comic", "risat", "funny", "laugh"],
    genres: ["comedy", "commedia"],
  },
  {
    query: ["romantico", "romantica", "romantici", "amore", "romance", "romantic"],
    evidence: ["amor", "romanz", "relazione", "innamor", "love", "romance", "relationship"],
    genres: ["romance", "romantico"],
  },
  {
    query: ["pauroso", "paura", "spaventoso", "horror", "scary"],
    evidence: ["paura", "terroriz", "incubo", "mostro", "horror", "scary", "nightmare", "monster"],
    genres: ["horror"],
  },
  {
    query: ["teso", "tesa", "tensione", "suspense", "thrilling"],
    evidence: ["tension", "suspense", "pericolo", "insegu", "danger", "chase"],
    genres: ["thriller"],
  },
  {
    query: ["famiglia", "familiare", "family"],
    evidence: ["famigli", "genitor", "figlio", "madre", "padre", "family", "parent", "child"],
    genres: ["family", "famiglia"],
  },
  {
    query: ["guerra", "bellico", "war"],
    evidence: ["guerra", "soldat", "battaglia", "esercito", "war", "soldier", "battle", "army"],
    genres: ["war", "guerra"],
  },
  {
    query: ["futuro", "futuristico", "future", "dystopian", "distopico"],
    evidence: ["futur", "distop", "dystop", "cyberpunk"],
    genres: ["science fiction", "sci-fi", "fantascienza"],
  },
  {
    query: ["scuola", "liceo", "universita", "school", "college"],
    evidence: ["scuol", "liceo", "student", "universit", "school", "college", "campus"],
  },
  {
    query: ["italia", "italiano", "italiana", "italiani", "italiane", "italian"],
    // Country/language is not a separate column yet, so this intentionally
    // relies on explicit setting/origin clues in the saved TMDB synopsis.
    evidence: ["italia", "italian", "roma", "romano", "napoli", "sicilia", "toscana", "milan"],
  },
  {
    query: ["crimine", "criminale", "mafia", "crime", "gangster"],
    evidence: ["crimin", "mafia", "gangster", "detective", "polizi", "crime", "police"],
    genres: ["crime", "crimine"],
  },
  {
    query: ["animato", "animata", "animazione", "cartone", "animated", "animation"],
    evidence: ["animaz", "animated", "animation"],
    genres: ["animation", "animazione"],
  },
  {
    query: ["documentario", "documentari", "documentary"],
    evidence: ["documentar", "documentary"],
    genres: ["documentary", "documentario"],
  },
];

const STOP_WORDS = new Set([
  "a", "al", "alla", "alle", "allo", "ambientato", "ambientata", "ambientati", "ambientate",
  "and", "che", "con", "da", "dal", "dalla", "de", "dei", "del", "della", "delle", "di",
  "film", "films", "for", "gli", "ho", "i", "il", "in", "la", "le", "lo", "me", "mi",
  "movie", "movies", "nel", "nella", "nelle", "nello", "of", "on", "per", "qualcosa", "serie",
  "series", "show", "that", "the", "to", "tv", "un", "una", "uno", "visto", "vista", "viste",
  "visti", "watch", "watched", "with", "years", "ago", "fa", "anni", "tempo",
]);

function words(value: string): string[] {
  return normalizeTitle(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function containsAny(text: string, candidates: string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

function requestedMediaType(query: string): "Movie" | "Series" | null {
  const tokens = new Set(words(query));
  if (["serie", "series", "show", "tv"].some((word) => tokens.has(word))) return "Series";
  if (["film", "movie", "movies", "commedia", "commedie", "documentario", "documentari"].some((word) => tokens.has(word))) {
    return "Movie";
  }
  return null;
}

/**
 * Ranks catalog metadata without a network call or an embedding service.
 * Exact title words remain strongest; genres, descriptions and a compact set
 * of mood/setting concepts make natural-language searches useful too.
 */
export function semanticSearch(
  titles: SemanticSearchTitle[],
  query: string,
  now = new Date(),
): { id: number; score: number }[] {
  const normalizedQuery = normalizeTitle(query).slice(0, 200);
  const queryWords = words(normalizedQuery).filter((word) => !STOP_WORDS.has(word));
  const mediaType = requestedMediaType(normalizedQuery);
  const concepts = CONCEPTS.filter((concept) => containsAny(normalizedQuery, concept.query));
  const requestedYear = normalizedQuery.match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  const requestedDecade = normalizedQuery.match(/\b(19\d0|20\d0)(?:s| anni)?\b/)?.[1];
  const prefersOlder = /\b(anni fa|tempo fa|years ago|long ago|vecchi|old)\b/.test(normalizedQuery);

  if (queryWords.length === 0 && concepts.length === 0 && !mediaType && !requestedYear && !prefersOlder) {
    return [];
  }

  return titles
    .flatMap((title) => {
      if (mediaType && title.mediaType !== mediaType) return [];

      const titleText = normalizeTitle(`${title.title} ${title.searchTitle}`);
      const genres = normalizeTitle(title.genres ?? "");
      const overview = normalizeTitle(title.overview ?? "");
      const platform = normalizeTitle(title.platform);
      const allText = `${titleText} ${genres} ${overview} ${platform}`;
      let score = 0;
      let evidence = 0;

      if (titleText.includes(normalizedQuery)) {
        score += 14;
        evidence += 1;
      }

      for (const word of queryWords) {
        if (titleText.includes(word)) {
          score += 7;
          evidence += 1;
        } else if (genres.includes(word)) {
          score += 5;
          evidence += 1;
        } else if (platform.includes(word)) {
          score += 4;
          evidence += 1;
        } else if (overview.includes(word)) {
          score += 2;
          evidence += 1;
        }
      }

      for (const concept of concepts) {
        const genreMatch = concept.genres ? containsAny(genres, concept.genres) : false;
        if (genreMatch || containsAny(allText, concept.evidence)) {
          score += genreMatch ? 7 : 5;
          evidence += 1;
        }
      }

      if (requestedYear && title.year === Number(requestedYear)) {
        score += 8;
        evidence += 1;
      }
      if (requestedDecade && title.year != null && Math.floor(title.year / 10) * 10 === Number(requestedDecade)) {
        score += 7;
        evidence += 1;
      }

      if (prefersOlder && title.lastWatchedAt) {
        const yearsAgo = (now.getTime() - title.lastWatchedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (yearsAgo >= 2) {
          score += Math.min(6, 1 + yearsAgo / 2);
          evidence += 1;
        }
      }

      // One weak word in a long description is noise. A structured or
      // conceptual match is already worth at least four points.
      if (evidence === 0 || score < 4) return [];
      return [{ id: title.id, score }];
    })
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, 80);
}
