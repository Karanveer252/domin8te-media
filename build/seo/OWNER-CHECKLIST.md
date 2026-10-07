# SEO: what only Karan can do (after v58 is live)

## Google Search Console (10 minutes)
1. search.google.com/search-console → add property `https://domin8temedia.com` (Domain property via DNS TXT on Hostinger is best).
2. Sitemaps → submit `https://domin8temedia.com/sitemap.xml` (14 URLs).
3. URL Inspection → Request indexing for `/`, `/services/`, `/services/website/`, `/services/seo/`, `/work/freddys/`.
4. Same in Bing Webmaster Tools (it can import from Search Console in one click).
5. Check `/` and one service page in the Rich Results Test (search.google.com/test/rich-results): expect Organization, Breadcrumb, FAQ.

## Google Business Profile for Domin8te Media
1. Create it as a **service-area business** (no public address unless you have an office): name exactly `Domin8te Media`.
2. Category: Marketing agency (extra: Internet marketing service).
3. Service area: the regions you actually sell into.
4. Website `https://domin8temedia.com`, email karanhelps@domin8temedia.com, phone if you want calls.
5. Description: start from the About page's meta line.
6. Photos: the logo, the rainbow mark, screenshots from /work/.
7. Services: Website, SEO / Google Business Profile, Social media, Ads (link each to its /services/ page).
8. Post weekly, linking a service page or a note on /blog/.
9. Ask clients for reviews by asking in person or by email to people who agreed to hear from you (CASL); never offer anything for a review.

## Waiting on you (the site has slots for these)
- **Case-study numbers:** each story page has a `<!-- RESULTS: ... -->` comment where a Results chapter goes, only with numbers the client confirms.
- **sameAs:** when Domin8te has Instagram / LinkedIn / Facebook pages, add their URLs to `sameAs` in the homepage JSON-LD.
- **Phone or city:** none published by decision. If that changes: footer line in `seo/build.py` (AREA) and the homepage JSON-LD.
- **Privacy policy:** written from what the site does today (form → email, Clerk sign-in, Supabase data, no analytics). If you add Google Analytics, a Meta pixel or a newsletter, update /privacy/ (seo/pages/privacy.html) first. It promises a reply to privacy requests within 30 days (the legal limit in Canada).

## Changing the SEO pages
Copy lives in `C:\Work\domin8te-build\seo\pages\*.html` (rules in WRITING.md). `python build.py` rebuilds every page and sitemap.xml;
`python patch_existing.py` re-applies the homepage/work-page head changes and re-tokens css/js after an asset edit.
