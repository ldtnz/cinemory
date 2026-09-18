/**
 * What can be imported, and how to get it out of each service.
 *
 * Every streaming service hides this differently, and two of the three have
 * no export at all — so the instructions are as much a part of the feature as
 * the parser is. They live here rather than in the dialog so that adding a
 * service is one entry, and so the wording stays next to the `Format` it
 * belongs to (see src/lib/history.ts).
 */

export type ImportSource = {
  /** Matches the detected Format where one exists; free-form otherwise. */
  id: string;
  name: string;
  /** What you actually get. Disney+ is the reason this exists: its file is a
   *  watchlist, not a history, and saying so up front avoids the reasonable
   *  assumption that titles will land in the watched half. */
  gives: "history" | "watchlist";
  /** One line under the name in the picker. */
  tagline: string;
  /** How to obtain the file, in order. */
  steps: string[];
  /** The header row the importer expects, shown so a file can be checked
   *  before uploading it. */
  columns: string;
  /** A row or two in that shape. */
  sample: string[];
  /** Anything the reader should know before trusting the result. */
  caveat?: string;
  /** A script to run in the browser console, served from /public. */
  script?: { url: string; label: string };
  /** Where the export actually lives, when the service has one. */
  link?: { url: string; label: string };
};

export const IMPORT_SOURCES: ImportSource[] = [
  {
    id: "netflix",
    name: "Netflix",
    gives: "history",
    tagline: "Full viewing history, straight from your account",
    steps: [
      "Open Netflix on the web and sign in.",
      "Go to Account → Profiles, pick the profile, then Viewing activity.",
      "Scroll to the bottom and click Download all.",
      "You get NetflixViewingHistory.csv.",
    ],
    columns: "Title,Date",
    sample: ['"Breaking Bad: Season 5: Felina","15/01/24"', '"Dune","01/06/24"'],
    link: {
      url: "https://www.netflix.com/viewingactivity",
      label: "Netflix viewing activity",
    },
  },
  {
    id: "amazon",
    name: "Prime Video",
    gives: "history",
    tagline: "Full watch history, via a script in your browser",
    steps: [
      "Amazon has no download button for this, so it takes a script.",
      "Open primevideo.com/settings/watch-history and sign in.",
      "Open the browser console and paste in the exporter linked below.",
      "It saves a CSV with the columns shown here.",
    ],
    columns: "Date Watched,Type,Title,Path",
    sample: ['"2024-06-01 21:14","Movie","Dune","/detail/0ABCDEF"'],
    link: {
      url: "https://github.com/caret-collective/watch-history-exporter-for-amazon-prime-video",
      label: "Watch History Exporter for Prime Video",
    },
  },
  {
    id: "imdb",
    name: "IMDb",
    gives: "history",
    tagline: "Everything you rated, with the ratings kept",
    steps: [
      "Sign in on imdb.com and open Your Ratings from the account menu.",
      "Open the three-dot menu at the top of the list and choose Export.",
      "IMDb emails a link, or offers the file directly — it can take a few minutes.",
      "The file is called ratings.csv.",
    ],
    columns: "Const,Your Rating,Date Rated,Title,...,Title Type,Year,...",
    sample: ['"tt0111161",10,"2025-03-14","The Shawshank Redemption",...,"Movie",1994,...'],
    caveat:
      "The only export that knows what you made of a title, so your ratings come " +
      "across too. It cannot say where you watched anything, so the platform is left " +
      "as \u201CNot sure\u201D and \u201CDate Rated\u201D stands in for the date watched.",
    link: { url: "https://www.imdb.com/list/ratings", label: "Your IMDb ratings" },
  },
  {
    id: "letterboxd",
    name: "Letterboxd",
    gives: "history",
    tagline: "Your diary, with the dates you watched and your own ratings",
    steps: [
      "Sign in on letterboxd.com and open Settings → Data.",
      "Click Export your data. You get a zip.",
      "Unzip it: diary.csv is the one with watched dates, watched.csv is " +
        "everything you have ever marked, watchlist.csv is what you still mean to see.",
      "Upload whichever you want — several at once is fine.",
    ],
    columns: "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
    sample: ['"2025-03-14","Perfect Days",2023,"https://boxd.it/example",4.5,"No",,"2025-03-12"'],
    caveat:
      "Films only — Letterboxd has no television. It is the one export that carries the " +
      "release year, your star rating (out of five, kept here out of ten) and the day you " +
      "actually watched something rather than the day you logged it. Keep the file names " +
      "Letterboxd gave them: watched.csv and watchlist.csv are identical inside, and the " +
      "name is the only thing that says which half a title belongs in. Rewatches fold into " +
      "one row, keeping the most recent viewing.",
    link: { url: "https://letterboxd.com/settings/data/", label: "Letterboxd data export" },
  },
  {
    id: "disney-watchlist",
    name: "Disney+",
    gives: "watchlist",
    tagline: "Watchlist only — Disney+ does not let you export what you watched",
    steps: [
      "Open disneyplus.com on a computer and go to your Watchlist.",
      "Open the browser console (F12, or Cmd+Option+J on a Mac).",
      "Paste in the script below and press Enter.",
      "It scrolls the page itself, then saves disney-watchlist.csv.",
    ],
    columns: "Title,Type,Link",
    sample: ['"Andor","Series","https://www.disneyplus.com/series/andor/3x"'],
    caveat:
      "These are titles you have not watched, so they go to “To watch”. " +
      "Disney+ publishes no export and no API — even Simkl cannot sync it — so a real " +
      "watch history can only be had by asking Disney for it under GDPR, at " +
      "EMEA.dataprotection@disney.com.",
    script: { url: "/disney-watchlist.js", label: "disney-watchlist.js" },
  },
];
