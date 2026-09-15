/*
 * Collects your Disney+ watchlist into a CSV that Cinemory's importer reads.
 *
 * Disney+ has no data export and no public API, and it is the one service
 * Cinemory cannot import from a file you download: Simkl, which does this for
 * a living, does not sync it either, for the same reason. What it does have is
 * a watchlist page, so this reads that.
 *
 * It runs in YOUR browser, in the tab where you are already signed in. Nothing
 * is sent anywhere: it reads the page, builds a CSV and hands you the file.
 * No password, cookie or token is read, copied or transmitted, and nothing
 * about this script ever reaches Cinemory's server.
 *
 * HOW TO USE
 *   1. Open https://www.disneyplus.com and go to your Watchlist.
 *   2. Open the browser console (F12, or Cmd+Option+J on a Mac).
 *   3. Paste this whole file in and press Enter.
 *   4. It scrolls the page to load every tile, then downloads
 *      "disney-watchlist.csv".
 *   5. Upload that file on Cinemory's settings page, same as a Netflix or
 *      Prime Video export.
 *
 * Firefox and Safari ask you to type "allow pasting" in the console once
 * before they accept pasted code. That is their warning about scripts like
 * this one: only paste code you have read.
 *
 * IF IT FINDS NOTHING
 * Disney+ changes its markup without warning, so this tries several ways of
 * recognising a tile and prints which one worked. If the count is zero or
 * looks wrong, the report it prints is what is needed to fix it.
 */
(async () => {
  const OUT = "disney-watchlist.csv";

  // ---- 1. Load every tile -------------------------------------------------
  // The watchlist renders lazily, so what is in the DOM is only what has been
  // scrolled past. Scroll to the bottom until the height stops growing.
  async function loadEverything() {
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    let lastHeight = -1;
    let rounds = 0;
    while (rounds < 60) {
      const height = document.body.scrollHeight;
      if (height === lastHeight) {
        // Two stable rounds in a row: nothing more is coming.
        await settle(600);
        if (document.body.scrollHeight === height) break;
      }
      lastHeight = height;
      window.scrollTo(0, document.body.scrollHeight);
      await settle(700);
      rounds += 1;
    }
    window.scrollTo(0, 0);
    await settle(300);
    return rounds;
  }

  console.log("[cinemory] loading the whole watchlist…");
  const rounds = await loadEverything();

  // ---- 2. Find the tiles --------------------------------------------------
  // Several shapes, because Disney+ has used several. Each strategy returns
  // {title, type, link}; the report below says which one actually fired, which
  // is the thing worth knowing when the markup changes again.
  const strategies = [
    {
      name: "links to /movies/ or /series/",
      run: () =>
        [...document.querySelectorAll('a[href*="/movies/"], a[href*="/series/"]')].map((a) => ({
          title: titleOf(a),
          type: /\/series\//.test(a.getAttribute("href") || "") ? "Series" : "Movie",
          link: a.href,
        })),
    },
    {
      name: "links to /browse/entity-",
      run: () =>
        [...document.querySelectorAll('a[href*="/browse/entity-"]')].map((a) => ({
          title: titleOf(a),
          // This URL shape does not say which it is; Cinemory works it out
          // from the title, and TMDB settles it during enrichment.
          type: "",
          link: a.href,
        })),
    },
    {
      name: "anything with a data-testid naming a set item",
      run: () =>
        [...document.querySelectorAll('[data-testid*="set-item"], [data-testid*="tile"]')].map(
          (el) => {
            const a = el.querySelector("a") || el.closest("a");
            return {
              title: titleOf(el),
              type: a && /\/series\//.test(a.getAttribute("href") || "") ? "Series" : "",
              link: a ? a.href : "",
            };
          },
        ),
    },
  ];

  // A tile's name lives in whichever of these the current markup uses. The
  // image's alt text is usually the artwork's name and the most reliable.
  function titleOf(el) {
    const img = el.querySelector?.("img[alt]");
    const candidates = [
      img && img.getAttribute("alt"),
      el.getAttribute?.("aria-label"),
      el.querySelector?.("[aria-label]")?.getAttribute("aria-label"),
      el.getAttribute?.("title"),
      el.textContent,
    ];
    for (const c of candidates) {
      const t = (c || "").trim().replace(/\s+/g, " ");
      // Disney+ decorates labels with things like "Andor. Play." — keep the
      // part before a trailing instruction, and drop anything implausible.
      if (t && t.length <= 200) return t.replace(/\.\s*(play|watch now|details)\.?$/i, "").trim();
    }
    return "";
  }

  const report = [];
  let rows = [];
  for (const s of strategies) {
    let found = [];
    try {
      found = s.run().filter((r) => r.title);
    } catch (e) {
      report.push(`${s.name}: failed (${e.message})`);
      continue;
    }
    report.push(`${s.name}: ${found.length}`);
    if (found.length > rows.length) rows = found;
  }

  // ---- 3. De-duplicate ----------------------------------------------------
  const seen = new Map();
  for (const r of rows) {
    const key = r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && !seen.has(key)) seen.set(key, r);
  }
  const unique = [...seen.values()];

  console.log("[cinemory] scrolled %d times. What each way of reading the page found:", rounds);
  report.forEach((line) => console.log("   " + line));
  console.log("[cinemory] %d titles after removing duplicates.", unique.length);

  if (unique.length === 0) {
    console.warn(
      "[cinemory] Nothing found. Check you are on the Watchlist page and not the home page. " +
        "If you are, the markup has changed: copy the lines above and the output of\n" +
        "   document.querySelectorAll('a').length\n" +
        "so the selectors can be updated.",
    );
    return;
  }

  console.table(unique.slice(0, 10));
  if (unique.length > 10) console.log("   …and %d more.", unique.length - 10);

  // ---- 4. Build and download the CSV --------------------------------------
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "Title,Type,Link",
    ...unique.map((r) => [r.title, r.type, r.link].map(quote).join(",")),
  ].join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = OUT;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  console.log("[cinemory] saved %s — upload it on Cinemory's settings page.", OUT);
  // Also left on window, in case the download was blocked and it needs
  // copying out of the console by hand.
  window.cinemoryWatchlistCsv = csv;
  console.log("[cinemory] the CSV is also in window.cinemoryWatchlistCsv if the download failed.");
})();
