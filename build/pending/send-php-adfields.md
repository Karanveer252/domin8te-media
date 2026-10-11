# send.php: put the ad fields in the lead email (apply in the release AFTER v75)

Why here and not in hPanel: send.php ships inside every release zip (it is in v73/v74/v75), so a hand edit in
hPanel File Manager would be overwritten by the next deploy. Apply it to C:\Work\domin8te-media\send.php and ship it.
Not applied yet because the other session's v75 draft also replaces send.php (2026-10-11 03:38 version).

The /marketing/ page (built as /marketing-preview/) sends these extra POST fields with every checkup request:
utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, v (the ad name), landing_page, referrer, event_id.
The homepage sends none of them, so its emails stay exactly as they are.

## 1. After the `$challenge = bodySafe(...)` line, add

```php
/* where a marketing-page lead came from: the ad's UTM tags, Facebook's click id, the ad name ("v"),
   the landing address, the referrer and the Pixel event id. Empty for the homepage. */
$adKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'v', 'landing_page', 'referrer', 'event_id'];
$adLines = [];
foreach ($adKeys as $k) {
    $x = headerSafe((string)($_POST[$k] ?? ''), 300);
    if ($x !== '') $adLines[] = str_pad(($k === 'v' ? 'ad' : $k) . ':', 14) . $x;
}
```

## 2. Right after the `$lines = [ ... ];` array closes, add

```php
if ($adLines) {
    $at = array_search('Page:        ' . $page, $lines, true);
    if ($at !== false) array_splice($lines, $at + 1, 0, array_merge(['', 'Where it came from:'], $adLines));
}
```

## 3. Test before shipping

Local serve.js fakes send.php, so test on the live site after deploy: send one checkup from
https://domin8temedia.com/marketing/?utm_source=facebook&utm_campaign=test&v=caveman and check the email shows
"Where it came from:" with utm_source, utm_campaign, ad and event_id. Then send one from the homepage and check
it has no such block.
