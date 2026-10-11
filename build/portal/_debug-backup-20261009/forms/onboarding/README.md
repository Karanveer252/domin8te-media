# Domin8te onboarding

The setup flow a new Domin8te Media client goes through after they sign on:
20 short screens that collect what the studio needs to start work, mainly
manager access to their Google listing, Facebook, Instagram and ads.

Live at **https://domin8temedia.com/onboarding/**. Add `?demo` to the address
to try it with a sample client (Bayleaf Kitchen) without sending anything.

## Files

| File | What it is |
|---|---|
| `index.html` | The page shell: header, chapter rail, dock, help drawer, picture viewer |
| `steps.js` | Every screen as data: questions, options, chapters. Edit content here |
| `guides.js` | The "Where to tap" pictures for the Google and Facebook steps, drawn as SVG |
| `onboarding.js` | The engine: renders one step at a time, autosaves, sends the answers |
| `onboarding.css` | Styles. Same ground as the client dashboard: #F4F1EC with a 23px dot grid |
| `submit.php` | Mails the answers and any menu file to karanhelps@domin8temedia.com (PHP `mail()`, like the site's `send.php`) |
| `map.html` | Internal overview of every step. Local only, never deployed |
| `serve.js` | Local preview server on port 4310, with a stand-in for `submit.php`. Local only |

## Run it locally

```
node serve.js
```

Then open http://localhost:4310. On this machine it starts in demo mode;
add `?live` to try the real sending path against the local stand-in.

## How it behaves

- Answers save in the visitor's browser as they go, so they can stop and come back.
- Name, email and the name of the place are required. Everything else can be skipped,
  and skipped items are listed on the finish screen and in the email as "to sort on the call".
- Moving on from the last question sends everything to the studio. Nothing is sent in demo mode.
- Account access uses each platform's own manager invite (paste our email). It never asks for passwords.

## Deploying

The site deploys as one archive that replaces the whole folder, so the `onboarding/`
folder lives in the site folder (`C:\Work\domin8te-media\onboarding`) as well and ships with
every deploy. Copy `index.html`, `steps.js`, `guides.js`, `onboarding.js`, `onboarding.css`,
`submit.php` and `assets/` there; never `map.html`, `serve.js` or this README. CSS and JS are
cached for a year by the site's `.htaccess`, so `index.html` loads them with `?v=` tokens that
must change whenever the files do.
