# Ranking Abhyas in the top 10

Analysis and work done on **24 October 2026** for `https://app.mku.name.np/`.

Read this first: **no code change can guarantee a top-10 position.** Google ranks
pages on relevance, usefulness, authority and experience, and it decides those
from content and links, not from tags. What code can do is remove the mechanical
reasons a page is ignored and make the site easy to crawl, understand and quote.
That is what was fixed here. Section 6 is the work that actually moves rankings,
and most of it is content and links.

---

## 1. Audit result

`npm run audit:seo` checks every page, the sitemap, robots.txt, the manifest,
structured data, headings, images and internal links. Baseline, then after the
changes:

| | Before | After |
|---|---|---|
| Blocking errors | **14** | **0** |
| Warnings | 24 | 8 |
| Pages in sitemap | 3 | 3 |
| Visible words on the landing page | ~756 | ~939 |
| Structured-data blocks on `/` | 2 | 4 |

The 14 errors were all on `privacy.html` and `terms.html`: no meta description,
no canonical, no Open Graph. Every indexable page now has a unique title,
description, canonical URL and social preview.

The 8 remaining warnings are deliberate or on private pages:

- `manifest.json` has no `screenshots` (would need real in-app screenshots made
  while signed in — see §10).
- `index.html` still carries `meta keywords` (ignored by Google, harmless) and a
  hidden QR image with no `width`/`height`.
- `admin.html` has 13 `<h1>`s (one per screen in a single-page console), heading
  jumps, and two render-blocking scripts in `<head>`.
- `user.html` has one heading jump and ~99 KB of inline CSS.

`user.html` and `admin.html` are `noindex`; the layout warnings there affect
users, not search rankings, and fixing them means reworking the app shell, not
adding tags.

---

## 2. What changed

### `index.html` — the only page that can rank

- **Explicit, permissive robots meta**: `index,follow,max-image-preview:large,
  max-snippet:-1,max-video-preview:-1`. Large image previews are what make a
  result look worth clicking.
- **New social preview** `og-cover.png` (1200×630, generated from
  `tools/og-card.html`) replacing the square 512 px icon, plus
  `summary_large_image`, `og:site_name`, image dimensions and alt text. A square
  icon rendered as a tiny thumbnail before.
- **Structured data** now describes the product, not just the app type:
  `WebApplication` (publisher, languages, feature list, offer description),
  `Organization` (logo, area served, contact), `WebSite`, and the existing
  `FAQPage`.
- **A crawlable exam section**: “The Level 7 Civil Engineering paper” with the
  100-mark written structure, the four groups, and the topic list — all in the
  HTML, not rendered by JavaScript. This is the first content on the page that
  answers a search query rather than describing the product.
- **Smaller fixes**: canonical kept, description shortened from 171 to 144
  characters so Google does not cut it, font preloads, stale Google-Fonts
  preconnects removed (fonts are self-hosted), footer shows the last update date.

### `user.html` and `admin.html` — must never rank

- `user.html`: `noindex,nofollow` → **`noindex,follow`**. The app shell should
  never appear in results, but `nofollow` served no purpose and only hid links.
- `admin.html`: `noindex,nofollow` kept, plus `Disallow: /admin.html` in
  robots.txt, a `same-origin` referrer policy (student data in URLs should not
  leak), and a real title instead of the 12-character “Abhyas Admin”.
- Both got `apple-touch-icon` (index already had one), and both now preload the
  two Inter weights their first screen actually uses.
- I did **not** make these pages indexable. They contain a login form, a blank
  app shell, and personal data; indexing them would create thin, duplicate pages
  and could expose student material. “Index all pages” is the wrong move here —
  index the pages that answer questions, keep the app itself private.

### `privacy.html` and `terms.html`

Unique description, canonical, robots, theme colours, Open Graph, Twitter card,
icon, and `WebPage` structured data. These are trust pages: they rarely rank,
but Google uses them to judge whether a site is a real product with a real owner.

### Site-wide

- `robots.txt`: blocks `/admin.html`, `/tests/`, `/node_modules/`; keeps
  `user.html` crawlable on purpose so its `noindex` tag is actually seen; keeps
  the sitemap line.
- `sitemap.xml`: all three indexable URLs, `lastmod` refreshed to today.
- `npm run audit:seo` + `tests/seo.test.js`: 7 tests that fail the build if the
  canonical disappears, a `noindex` page enters the sitemap, the social image
  shrinks, or the structured data stops parsing. `verify` now runs the audit
  before the tests.

---

## 3. What “top 10” actually needs

Three things, in this order:

1. **A page that answers the query.** One landing page can answer “what is
   Abhyas”, but not “structural engineering loksewa notes”, “loksewa civil
   engineering syllabus” and “civil engineering past questions” at the same time.
2. **Enough authority to be believed.** For a new subdomain that means links from
   places Nepali candidates already trust: college sites, Facebook groups, YouTube
   descriptions, app directories.
3. **A result people click and stay on.** Title, description, speed, mobile
   layout, no intrusive popups.

The site now passes (3) technically and has a first piece of (1). It has almost
none of (2).

---

## 4. Competitive read (searched 24 Oct 2026)

For **“loksewa civil engineering app Nepal practice questions”**, the top 10 is:

| # | Result | Type |
|---|---|---|
| 1 | loksewatayariapp.com/exam/civil-engineer | Dedicated exam page, established site |
| 2–3 | Facebook group posts | Social, not a site |
| 4 | Scribd PDF | Document |
| 5 | Reddit thread | Forum |
| 6 | mcqhall.com/hall/CivilEngineerSewaNepal | Question-hall page |
| 7 | mymocksewa.com | Mock-test platform |
| 8 | veedhyapeeth.com article | Content article |
| 9 | loksewatayariapp.com/service/civil-engineer | Second page from the same site |
| 10 | Facebook video | Social |

For **“loksewa civil engineering syllabus level 7 marks group”** the results are
Facebook videos, Scribd PDFs, YouTube, course pages and blogs — no single
authoritative page.

Two things follow. The competition is beatable: much of the top 10 is PDFs,
Facebook posts and old threads. And the winners are not winning on tags — they
are winning with **a page per intent** (an exam page, a syllabus page, a question
hall) and with **links and shares** from the communities candidates use.

The site that consistently appears twice, `loksewatayariapp.com`, does exactly
that: one page for the exam, one for the service, one for the syllabus.

---

## 5. Query map

| Query | Intent | Where it is answered now | Status |
|---|---|---|---|
| abhyas app | Brand | `/` | Covered |
| loksewa civil engineering app | Product | `/` | Partly — needs links to rank |
| loksewa level 7 civil engineering syllabus | Research | `#syllabus` on `/` | Covered as a section, not a page |
| civil engineering loksewa question | Practice | `#try` (JavaScript only) | Weak — content not in the HTML |
| loksewa offline app | Product feature | `#about` | Covered |
| loksewa subjective question | Practice | `#about` | Not covered |
| civil engineering loksewa past paper | Research | — | Missing |
| loksewa GK questions | Practice | — | Missing |

---

## 6. The real gap: indexable pages

There is exactly **one** indexable page. Until that changes, the ceiling is low
no matter how clean the tags are. The next three pages, in order of value:

1. **`/syllabus/` — “Loksewa Level 7 Civil Engineering syllabus”**. The section
   added today is the seed. A full page: every group, every topic, mark weight,
   what to study first, and a link into the matching chapter. This is the query
   where the current top 10 is weakest.
2. **`/past-papers/` or `/questions/`** — one page per subject with real sample
   questions and worked answers (not a login wall). This is what “question”
   searchers want, and it is what the app already owns privately.
3. **`/gk/`** — General Knowledge and IQ practice, the highest-volume adjacent
   query and the easiest to write.

Rules for each page: 600+ words of genuinely useful text, its own title,
description, canonical and `FAQPage`/`Article` data, links to the app and to the
other pages, and a visible “last updated” date. Do **not** generate hundreds of
near-identical pages from the chapter list — Google treats those as doorway
pages and they can drag the whole domain down.

A Nepali version (`/ne/…`) with `hreflang` would double the reachable queries, but
only after the English pages work.

---

## 7. Authority: links that actually exist for this audience

- College and +2/engineering campus notice boards and Facebook pages.
- The big Loksewa Facebook groups (the search results show they outrank sites).
  Share a genuinely useful syllabus page, not the app homepage.
- YouTube: Loksewa civil engineering channels; a description link and a pinned
  comment. This is where the search traffic already goes.
- Reddit r/Nepal and r/IOE — only with a real answer, not a drive-by link.
- App directories: PWA directory listings, Product Hunt (low local value), and a
  Play Store listing through a Trusted Web Activity if installs matter.
- Local news/education blogs writing about Loksewa prep; offer data (pass rates,
  syllabus changes) rather than a press release.

Ten to twenty real links from these places will matter more than any further
metadata work.

---

## 8. Measurement

There is no analytics by design (privacy page says “no ads, no tracking”). Keep
that promise and measure with search consoles:

1. **Google Search Console** — verify `app.mku.name.np` (DNS or an HTML meta tag
   you paste into `index.html`), submit `sitemap.xml`, use URL Inspection on `/`,
   `/privacy.html`, `/terms.html`, then watch Performance → Queries.
2. **Bing Webmaster Tools** — import from GSC; Bing also feeds ChatGPT-style
   answer engines. Enable IndexNow if the host supports it.
3. Track weekly: pages indexed, impressions, average position, clicks, CTR. A
   page at position 11–20 with impressions is the one to expand; a page with no
   impressions has an indexing or relevance problem.

Search Console verification needs a token only you can create; that is why it is
not in the repo.

---

## 9. 90-day plan

**Weeks 1–2**
- Verify GSC, submit the sitemap, request indexing for `/`.
- Fix anything GSC reports under Page indexing.
- Post the syllabus section in two Loksewa Facebook groups and one YouTube
  comment, linking the page that answers the question.
- Check the syllabus marks against the current PSC notice (see §10).

**Weeks 3–6**
- Build `/syllabus/` as a full page; link it from `/` and from the app.
- Build one subject question page (Structure is the best first bet) with 20 real
  questions and explanations.
- Add `Article`/`FAQPage` data and internal links between the three pages.
- Ask 3–5 colleges/teachers to link to the syllabus page.

**Weeks 7–12**
- Two more subject pages and a GK page.
- Re-run `npm run audit:seo` after every content change.
- Review GSC: expand the page with the best impressions-to-position ratio.
- Consider a Nepali version once English pages have impressions.

---

## 10. What only you can do

- **Search Console / Bing verification** — create the property and send me the
  token, or paste the meta tag yourself.
- **Confirm the syllabus marks.** The table on `/` comes from
  `js/data/subjective_chapters.js` (30/25/25/20). The page says it is how Abhyas
  organises the paper and tells readers to check the PSC notice, but the numbers
  should be checked against the current syllabus before you promote the page.
- **Decide about the domain.** `app.mku.name.np` is a subdomain. If you own
  `mku.name.np`, serving the landing page at the root and keeping the app on the
  subdomain concentrates authority; a subdomain starts from zero on its own.
- **Links and shares** — no code can create them.
- **Real screenshots** for the manifest and app-store listings, taken while
  signed in.

---

## 11. Limits, stated plainly

- No guarantee of a top-10 position, for any query, ever. Rankings move with
  competitors and algorithm updates.
- This work fixes crawlability, metadata, structured data, social previews and
  the first piece of content. It does not create authority.
- `user.html` and `admin.html` are intentionally excluded from the index. If you
  want more indexable pages, the answer is public syllabus/question pages, not
  exposing the app shell.
- A PWA does not appear in Play Store search. A Trusted Web Activity wrapper
  would, and is a separate project.
- The audit is static. It cannot see what Google actually indexed; Search Console
  is the source of truth for that.
