<?php
declare(strict_types=1);
/* ============================================================
   Domin8te Media: Meta Conversions API, server-side "Lead" (website)
   Pixel 1300852505438917, Graph v26.0. Adapted from the Oct 19 setup guide, Appendix A.

   - Lives in public_html next to send.php. Holds NO secret. The access token is read
     from a file one level ABOVE public_html (meta_capi_token.php, "<?php return '...';").
   - send.php calls d8_capi_lead_after_send() ONLY in its success branch, after mail() succeeded,
     right before it answers {"ok":true}. Nothing here can change that answer:
     every error is caught, logged without personal data, and swallowed.
   - The request to Meta runs at script shutdown, after the JSON answer is flushed to the browser
     where the server allows it (LiteSpeed / FastCGI). It is capped at 3 s either way.
   - Same event_id as the browser Pixel Lead (the hidden "event_id" field marketing.js adds), so
     Meta dedups the pair. Hashed: em, ph, fn (SHA-256 of normalized values). Unhashed: IP, UA, fbp, fbc.
   ============================================================ */

/* Opened directly in a browser: nothing to see here. */
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME'])
    && @realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

const D8_CAPI_PIXEL_ID    = '1300852505438917';
const D8_CAPI_API_VER     = 'v26.0';
const D8_CAPI_SITE        = 'https://domin8temedia.com';
const D8_CAPI_SOURCE_URL  = 'https://domin8temedia.com/marketing/';
const D8_CAPI_TIMEOUT_S   = 3;
const D8_CAPI_LOG_MAX     = 1048576; // rotate the log at 1 MB (one .1 copy kept)

/* Token and log live ABOVE the web root: public_html/.. (on Hostinger, ~/domains/domin8temedia.com/).
   A test harness may define D8_CAPI_TOKEN_FILE / D8_CAPI_LOG_FILE / D8_CAPI_GRAPH_BASE first; production does not. */
function d8_capi_token_file(): string {
    if (defined('D8_CAPI_TOKEN_FILE')) return (string)D8_CAPI_TOKEN_FILE;
    $above = dirname(__DIR__) . '/meta_capi_token.php';          // preferred: ~/domains/domin8temedia.com/
    $private = __DIR__ . '/_private/meta_capi_token.php';         // fallback: deny-all folder inside public_html
    return @is_file($above) ? $above : $private;
}
function d8_capi_log_file(): string {
    return defined('D8_CAPI_LOG_FILE') ? (string)D8_CAPI_LOG_FILE : dirname(__DIR__) . '/meta_capi.log';
}

/* One line per outcome: time, event_id (a random id, not personal), result code. Never contact data, token or IP. */
function d8_capi_log(string $eventId, string $msg): void {
    $id = substr((string)preg_replace('/[^A-Za-z0-9-]/', '', $eventId), 0, 80);
    $line = date('c') . ' capi event_id=' . ($id === '' ? '-' : $id) . ' ' . $msg . "\n";
    $f = d8_capi_log_file();
    $size = @filesize($f);
    if (is_int($size) && $size > D8_CAPI_LOG_MAX) @rename($f, $f . '.1');
    $new = !@is_file($f);
    $ok = @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
    if ($ok === false) { @error_log(trim($line)); return; }
    if ($new) @chmod($f, 0600);
}

/* A POSTed field as a string (an array posted as name[]= becomes ''). */
function d8_capi_in(string $key): string {
    $v = $_POST[$key] ?? '';
    return is_string($v) ? $v : '';
}

function d8_capi_hash(string $v): string {
    return hash('sha256', $v);
}
function d8_capi_norm_email(string $v): string {
    $v = strtolower(trim($v));
    return filter_var($v, FILTER_VALIDATE_EMAIL) !== false ? $v : '';
}
/* Digits only, with country code. Canada/US default: 10 digits get a leading 1. */
function d8_capi_norm_phone(string $v): string {
    $d = (string)preg_replace('/\D+/', '', $v);
    if (strlen($d) === 10) $d = '1' . $d;
    return (strlen($d) >= 11 && strlen($d) <= 15) ? $d : '';
}
/* First word of the name, lowercase, letters only (Meta: fn is lowercase, no punctuation).
   mbstring is used when present; without it only ASCII letters are lowercased. */
function d8_capi_norm_first(string $v): string {
    $parts = preg_split('/\s+/u', trim($v), -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($parts) || !isset($parts[0])) return '';
    $w = (string)$parts[0];
    $w = function_exists('mb_strtolower') ? mb_strtolower($w, 'UTF-8') : strtolower($w);
    return (string)preg_replace('/[^\p{L}]+/u', '', $w);
}

/* The visitor's IP as PHP sees it. Hostinger passes the visitor address in REMOTE_ADDR; only when
   that is a private/reserved address (a proxy) is the first X-Forwarded-For entry used. */
function d8_capi_client_ip(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $public = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    if ($public === false && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $first = trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        if (filter_var($first, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) return $first;
    }
    return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : '';
}

/* fbc: the _fbc cookie, else built from the fbclid the page already posts (hidden field) in Meta's format
   fb.1.<ms>.<fbclid>. fbp: the Pixel's _fbp cookie (first-party, sent with the same-origin fetch). */
function d8_capi_fbc(): string {
    $c = $_COOKIE['_fbc'] ?? '';
    if (is_string($c) && preg_match('/^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]{10,500}\z/', $c)) return $c;
    $id = d8_capi_in('fbclid');
    if (preg_match('/^[A-Za-z0-9_\-]{10,500}\z/', $id)) return 'fb.1.' . (int)round(microtime(true) * 1000) . '.' . $id;
    return '';
}
function d8_capi_fbp(): string {
    $c = $_COOKIE['_fbp'] ?? '';
    return (is_string($c) && preg_match('/^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]{1,100}\z/', $c)) ? $c : '';
}

/* The browser's id (marketing.js sends lead-<ms>-<8 base36>, but any format is kept) passes through
   unchanged when it is 8 to 100 characters of [A-Za-z0-9_-] only. A missing, too short, too long or
   otherwise malformed id gets a server id: the event still counts, but Meta cannot pair it with the browser Lead. */
function d8_capi_event_id(bool &$fromBrowser): string {
    $posted = d8_capi_in('event_id');
    $fromBrowser = preg_match('/^[A-Za-z0-9_-]{8,100}\z/', $posted) === 1;
    if ($fromBrowser) return $posted;
    return 'lead-srv-' . (int)round(microtime(true) * 1000) . '-' . bin2hex(random_bytes(4));
}

/* Build the event from the POST the form already sends (name, contact + email|phone, event_id, fbclid,
   landing_page). Nothing on the form changes. */
function d8_capi_build_payload(string $eventId, string $testCode = ''): array {
    $ud = [];
    $ip = d8_capi_client_ip();                     if ($ip !== '') $ud['client_ip_address'] = $ip;
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua !== '') $ud['client_user_agent'] = substr($ua, 0, 512);
    $fbp = d8_capi_fbp();                          if ($fbp !== '') $ud['fbp'] = $fbp;
    $fbc = d8_capi_fbc();                          if ($fbc !== '') $ud['fbc'] = $fbc;

    /* site.js copies "contact" into email OR phone; the other one usually arrives empty */
    $contact = trim(d8_capi_in('contact'));
    $em = d8_capi_norm_email(d8_capi_in('email'));
    if ($em === '') $em = d8_capi_norm_email($contact);
    if ($em !== '') $ud['em'] = [d8_capi_hash($em)];
    $ph = d8_capi_norm_phone(d8_capi_in('phone'));
    if ($ph === '' && $contact !== '' && strpos($contact, '@') === false) $ph = d8_capi_norm_phone($contact);
    if ($ph !== '') $ud['ph'] = [d8_capi_hash($ph)];
    $fn = d8_capi_norm_first(d8_capi_in('name'));
    if ($fn !== '') $ud['fn'] = [d8_capi_hash($fn)];

    /* the page the visitor submitted from, without its query string (no ids or UTMs in the URL sent) */
    $url = D8_CAPI_SOURCE_URL;
    $lp = (string)preg_replace('/[?#].*\z/s', '', d8_capi_in('landing_page'));
    if (preg_match('#^/[A-Za-z0-9/_.\-~%]{0,200}\z#', $lp) && strpos($lp, '//') === false) $url = D8_CAPI_SITE . $lp;

    $payload = ['data' => [[
        'event_name'       => 'Lead',
        'event_time'       => time(),
        'event_id'         => $eventId,
        'event_source_url' => $url,
        'action_source'    => 'website',
        'user_data'        => $ud,
        'custom_data'      => [
            'content_name'     => 'marketing-checkup',
            'content_category' => 'free_online_checkup',
        ],
    ]]];
    /* Only a real Test Events code (e.g. TEST12345). A leftover placeholder is ignored, never sent. */
    if (preg_match('/^TEST[A-Z0-9]{2,20}\z/', $testCode)) $payload['test_event_code'] = $testCode;
    return $payload;
}

function d8_capi_dir_denied(string $dir): bool {
    $h = @file_get_contents($dir . '/.htaccess');
    return is_string($h) && preg_match('/^[ \t]*(Require[ \t]+all[ \t]+denied|Deny[ \t]+from[ \t]+all)[ \t]*\r?$/mi', $h) === 1;
}

/* Web roots to keep the token out of: DOCUMENT_ROOT and the folder this file sits in (public_html). */
function d8_capi_web_roots(): array {
    $roots = [];
    foreach ([(string)($_SERVER['DOCUMENT_ROOT'] ?? ''), __DIR__] as $d) {
        if ($d === '') continue;
        $p = @realpath($d);
        if (is_string($p) && $p !== '') $roots[] = rtrim($p, DIRECTORY_SEPARATOR);
    }
    return array_values(array_unique($roots));
}

/* Resolved token path, or '' with a reason. Inside a web root only <root>/_private/meta_capi_token.php
   behind a deny-all .htaccess is accepted; anywhere else inside public_html is refused. */
function d8_capi_token_path(string &$why): string {
    $real = @realpath(d8_capi_token_file());
    if (!is_string($real) || $real === '' || !@is_readable($real)) { $why = 'token_missing'; return ''; }
    foreach (d8_capi_web_roots() as $root) {
        if ($real !== $root && strpos($real, $root . DIRECTORY_SEPARATOR) !== 0) continue;
        $dir = dirname($real);
        $ok = $dir === $root . DIRECTORY_SEPARATOR . '_private'
            && basename($real) === 'meta_capi_token.php'
            && d8_capi_dir_denied($dir);
        if (!$ok) { $why = 'token_inside_web_root'; return ''; }
    }
    return $real;
}

/* Reads the token without letting the file print anything. The value never leaves this process
   except in the JSON body sent to Meta. */
function d8_capi_read_token(string $path): string {
    ob_start();
    try {
        $t = (static function (string $f) { return require $f; })($path);
    } finally {
        ob_end_clean();
    }
    $t = is_string($t) ? trim($t) : '';
    if (strpos($t, 'PASTE_') !== false || !preg_match('/^[A-Za-z0-9_|\-]{20,1024}\z/', $t)) return '';
    return $t;
}

/* The request to Meta. Returns a short result code for the log. */
function d8_capi_post(array $payload): string {
    $why = '';
    $path = d8_capi_token_path($why);
    if ($path === '') return 'skip ' . $why;
    if (!function_exists('curl_init')) return 'skip no_curl';
    $token = d8_capi_read_token($path);
    if ($token === '') return 'skip token_unset';

    $payload['access_token'] = $token; // in the JSON body, not the URL, so it never lands in an access log
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    unset($payload, $token);
    if (!is_string($json)) return 'fail json_encode';

    $base = defined('D8_CAPI_GRAPH_BASE') ? rtrim((string)D8_CAPI_GRAPH_BASE, '/') : 'https://graph.facebook.com';
    $ch = curl_init($base . '/' . D8_CAPI_API_VER . '/' . D8_CAPI_PIXEL_ID . '/events');
    if ($ch === false) return 'fail curl_init';
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Expect:'],
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => D8_CAPI_TIMEOUT_S,
        CURLOPT_TIMEOUT        => D8_CAPI_TIMEOUT_S,
        CURLOPT_NOSIGNAL       => true,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    unset($json);
    $body = curl_exec($ch);
    $errno = curl_errno($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($errno !== 0) return 'fail curl_' . $errno;

    $j = is_string($body) ? json_decode($body, true) : null;
    if (!is_array($j)) $j = [];
    if ($http >= 200 && $http < 300) return 'ok http=' . $http . ' received=' . (int)($j['events_received'] ?? -1);
    /* Meta's error code and trace id only: never the body (it can echo request fields) */
    $e = is_array($j['error'] ?? null) ? $j['error'] : [];
    return 'fail http=' . $http . ' code=' . (int)($e['code'] ?? 0) . ' sub=' . (int)($e['error_subcode'] ?? 0)
        . ' trace=' . substr((string)preg_replace('/[^A-Za-z0-9_-]/', '', is_scalar($e['fbtrace_id'] ?? null) ? (string)$e['fbtrace_id'] : ''), 0, 64);
}

/* Once per event_id: an atomic create of a marker file in the temp folder. A second POST of the same
   submission finds the marker and sends nothing. Old markers are pruned now and then. */
function d8_capi_claim(string $eventId): bool {
    $dir = sys_get_temp_dir();
    $once = $dir . '/d8capi-' . D8_CAPI_PIXEL_ID . '-' . sha1($eventId);
    $fh = @fopen($once, 'x');
    if ($fh !== false) { @fclose($fh); }
    elseif (@file_exists($once)) return false;   // already sent (or sending) for this event_id
    // else: temp folder not writable; send anyway (Meta also dedups server events by event_id)

    if (random_int(1, 50) === 1) {
        $old = time() - 7 * 86400;
        foreach ((array)@glob($dir . '/d8capi-' . D8_CAPI_PIXEL_ID . '-*') as $f) {
            if (is_string($f) && (int)@filemtime($f) < $old) @unlink($f);
        }
    }
    return true;
}

/* THE ONE CALL send.php makes, in its success branch after mail() returned true.
   Sends at shutdown, once per event_id, and can never throw into send.php. */
function d8_capi_lead_after_send(string $testCode = ''): void {
    $eventId = '';
    try {
        $fromBrowser = false;
        $eventId = d8_capi_event_id($fromBrowser);
        if (!d8_capi_claim($eventId)) { d8_capi_log($eventId, 'skip duplicate'); return; }
        $payload = d8_capi_build_payload($eventId, $testCode);
        $tag = ($fromBrowser ? '' : ' server_id') . (isset($payload['test_event_code']) ? ' test' : '');
        register_shutdown_function(static function () use ($payload, $eventId, $tag): void {
            try {
                @ignore_user_abort(true);
                /* hand the visitor their answer first, where the server can (Hostinger runs LiteSpeed) */
                if (function_exists('litespeed_finish_request')) @litespeed_finish_request();
                elseif (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
                if (function_exists('set_time_limit')) @set_time_limit(15);
                d8_capi_log($eventId, d8_capi_post($payload) . $tag);
            } catch (Throwable $e) {
                try { d8_capi_log($eventId, 'fail exception ' . get_class($e)); } catch (Throwable $ignored) {}
            }
        });
    } catch (Throwable $e) {
        try { d8_capi_log($eventId, 'fail exception ' . get_class($e)); } catch (Throwable $ignored) {}
    }
}
