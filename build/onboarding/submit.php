<?php
declare(strict_types=1);

/* ============================================================
   Domin8te Media onboarding handler
   Mails a new client's setup answers, plus their menu file if they
   attached one, to the business mailbox on the same Hostinger server.
   Same approach as /send.php: the signed mailbox (smtp.hostinger.com, login file above
   public_html) when it exists, else PHP mail(). Replying to the email replies to the client.
   2026-10-15: after the studio's copy is sent, the client gets a short confirmation from
   Karan, and the answers are handed to the console (onboarding-intake function) so the
   client can be added with one click. Both extras are best effort: a failure is logged,
   never shown to the client, and never loses the studio's copy.
   ============================================================ */

const MAIL_TO   = 'karanhelps@domin8temedia.com';
const MAIL_FROM = 'website@domin8temedia.com';
const SITE_DOMAIN = 'domin8temedia.com';
const MAX_FILES = 3;
const MAX_TOTAL = 6291456; // 6 MB of files in total: base64 makes that about 8.4 MB in the mail, under the usual 10 MB limit
const RATE_SECS = 30;      // one send per person (IP and email) per this many seconds
const MIN_MS    = 4000;    // a person cannot finish the form faster than this
/* Extension fallback for when the content sniffer only says "some container". */
const EXT_TYPES = [
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'heic' => 'image/heic', 'heif' => 'image/heif', 'avif' => 'image/avif', 'pdf' => 'application/pdf',
    'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
/* Generic sniffer answers, and which extensions may stand in for them. */
const GENERIC_TYPES = [
    'application/octet-stream'  => ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'pdf', 'doc', 'docx'],
    'application/zip'           => ['docx'],
    'application/CDFV2'         => ['doc'],
    'application/vnd.ms-office' => ['doc'],
    'video/quicktime'           => ['heic', 'heif', 'avif'],
];
const OK_TYPES  = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(bool $ok, string $error = '', int $code = 200): void {
    http_response_code($code);
    echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'method', 405);
}

/* Only our own pages may post here. A missing header is allowed (some browsers and privacy tools drop it). */
function originAllowed(string $v): bool {
    $p = parse_url($v);
    if (!is_array($p) || empty($p['scheme']) || empty($p['host'])) return false;
    $scheme = strtolower((string)$p['scheme']); $host = strtolower((string)$p['host']);
    if ($host === 'localhost') return $scheme === 'http'; // local testing
    return $scheme === 'https' && in_array($host, ['domin8temedia.com', 'www.domin8temedia.com'], true)
        && (!isset($p['port']) || (int)$p['port'] === 443);
}
foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $h) {
    $hv = (string)($_SERVER[$h] ?? '');
    if ($hv !== '' && !originAllowed($hv)) respond(false, 'origin', 403);
}

/* A body bigger than post_max_size arrives as an empty $_POST. Say so, not "missing". */
if (empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    respond(false, 'toobig', 413);
}

/* Time check: the page sends ms since the visit began. Too fast is usually a bot, but losing a real client's
   onboarding is far worse than one odd email: it is delivered, only marked in the subject. */
$t = $_POST['t'] ?? null;
$hasT = is_string($t) && $t !== '' && is_numeric($t);
$fast = $hasT && (float)$t >= 0 && (float)$t < MIN_MS;

/* Hidden field. Bots fill it, but a browser's autofill can too, so a filled field alone must never lose a real
   client's onboarding. It is dropped only when the post ALSO looks like a bot (the page's script never sent a time,
   or it was faster than a person); anyone else is delivered, marked in the subject. Hits are logged (no personal data). */
$trap = trim((string)($_POST['d8x'] ?? '')) !== '';
if ($trap) {
    $bot = !$hasT || $fast;
    error_log(date('c') . ' onboarding submit.php hidden field filled; ' . ($bot ? 'dropped (looks like a bot)' : 'delivered, tagged'));
    if ($bot) respond(true); // look successful, deliver nothing
}

/* Strip CR and LF from anything that touches a mail header. */
function headerSafe(string $v, int $max = 200): string {
    $v = str_replace(["\r", "\n", "\0", '%0a', '%0d', '%0A', '%0D'], ' ', $v);
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

/* A display name for a header: no characters that could end the name or start another address. */
function nameSafe(string $v, int $max = 100): string {
    $v = str_replace(['<', '>', '"', ',', ';', ':', '\\'], ' ', headerSafe($v, $max));
    return trim(preg_replace('/\s+/u', ' ', $v) ?? '');
}

/* SMTP through the signed mailbox: the same function as /send.php (each file ships on its own). */
function smtpSend(array $cfg, string $to, string $subject, string $body, array $extraHeaders, string $fromName = 'Domin8te Website'): bool {
    $user = (string)($cfg['user'] ?? ''); $pass = (string)($cfg['pass'] ?? '');
    if ($user === '' || $pass === '') return false;
    $fp = @stream_socket_client('ssl://' . ($cfg['host'] ?? 'smtp.hostinger.com') . ':' . (int)($cfg['port'] ?? 465), $errno, $errstr, 15);
    if (!$fp) { error_log(date('c') . ' d8-onboarding smtp connect failed: ' . $errno); return false; }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): string {                 // one reply, all its lines ("250-..." continues, "250 ..." ends)
        $all = '';
        while (($line = fgets($fp, 1024)) !== false) { $all .= $line; if (strlen($line) < 4 || $line[3] !== '-') break; }
        return $all;
    };
    $cmd = function (string $c, string $want) use ($fp, $read): bool {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        if (strncmp($r, $want, strlen($want)) !== 0) {
            /* log the server's code only, never what was sent (it holds the login) */
            error_log(date('c') . ' d8-onboarding smtp step failed, expected ' . $want . ', got ' . substr($r, 0, 3));
            return false;
        }
        return true;
    };
    $domain = substr(strrchr($user, '@') ?: '@' . SITE_DOMAIN, 1);
    $ok = $cmd('', '220') && $cmd('EHLO ' . $domain, '250') && $cmd('AUTH LOGIN', '334')
       && $cmd(base64_encode($user), '334') && $cmd(base64_encode($pass), '235')
       && $cmd('MAIL FROM:<' . $user . '>', '250') && $cmd('RCPT TO:<' . $to . '>', '250') && $cmd('DATA', '354');
    if ($ok) {
        $head = array_merge([
            'Date: ' . date('r'),
            'From: ' . $fromName . ' <' . $user . '>',
            'To: <' . $to . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $domain . '>',
        ], $extraHeaders);
        $text = str_replace("\n", "\r\n", str_replace(["\r\n", "\r"], "\n", $body));
        $text = preg_replace('/^\./m', '..', $text);          // a line starting with "." must not end the message
        $ok = $cmd(implode("\r\n", $head) . "\r\n\r\n" . $text . "\r\n.", '250');
    }
    fwrite($fp, "QUIT\r\n"); fclose($fp);
    return $ok;
}

/* Body text keeps its line breaks but loses control characters. */
function bodySafe(string $v, int $max = 20000): string {
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = preg_replace('/[^\P{C}\n]+/u', '', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}

$first   = headerSafe((string)($_POST['first'] ?? ''), 80);
$last    = headerSafe((string)($_POST['last'] ?? ''), 80);
$email   = headerSafe((string)($_POST['email'] ?? ''), 190);
$mobile  = headerSafe((string)($_POST['mobile'] ?? ''), 60);
$place   = headerSafe((string)($_POST['place'] ?? ''), 160);
$summary = bodySafe((string)($_POST['summary'] ?? ''));
$answers = bodySafe((string)($_POST['answers'] ?? ''), 20000);
$slot    = headerSafe((string)($_POST['slot'] ?? ''), 160);

if ($first === '' || $place === '' || $summary === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || preg_match('/[<>",;\\\\\\s]/', $email)) { // no quoted or odd addresses in a header
    respond(false, 'missing', 422);
}

/* Duplicate guard: the page sends one random id per submission. If we already sent it, say ok and stop. */
$sid = (string)($_POST['sid'] ?? '');
$sidFile = preg_match('/^[A-Za-z0-9-]{8,64}$/', $sid) ? sys_get_temp_dir() . '/d8ob-sid-' . sha1($sid) : '';
if ($sidFile !== '' && @is_file($sidFile)) {
    respond(true);
}

/* Throttle: one send per person (IP and email) per RATE_SECS, so two people on one Wi-Fi are not blocked.
   Cleared again if the mail fails, so a retry is not blocked. */
$rateFile = sys_get_temp_dir() . '/d8ob-rate-' . sha1((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . mb_strtolower($email));
if (@is_file($rateFile) && time() - (int)@filemtime($rateFile) < RATE_SECS) {
    respond(false, 'rate', 429);
}

/* Attached files: images, PDFs and Word documents only, checked by content. */
function detectType(string $path, string $claimed, string $origName): string {
    $t = '';
    if (class_exists('finfo')) {
        $r = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (is_string($r)) $t = $r;
    }
    if ($t === '' && function_exists('mime_content_type')) {
        $r = mime_content_type($path);
        if (is_string($r)) $t = $r;
    }
    if ($t === '') $t = $claimed;
    /* Phones, Word and some servers only get as far as "a container". Trust the extension, from a short list. */
    if (isset(GENERIC_TYPES[$t])) {
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (in_array($ext, GENERIC_TYPES[$t], true)) return EXT_TYPES[$ext];
    }
    return $t;
}

$attach = [];
$total = 0;
if (isset($_FILES['files']) && is_array($_FILES['files']['name'] ?? null)) {
    $count = count($_FILES['files']['name']);
    if ($count > MAX_FILES) {
        respond(false, 'toomany', 422);
    }
    for ($i = 0; $i < $count; $i++) {
        $err = (int)$_FILES['files']['error'][$i];
        if ($err === UPLOAD_ERR_NO_FILE) continue;
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) respond(false, 'toobig', 413);
        if ($err !== UPLOAD_ERR_OK) respond(false, 'file', 422);
        $tmp = (string)$_FILES['files']['tmp_name'][$i];
        if (!is_uploaded_file($tmp)) respond(false, 'file', 422);
        $size = (int)filesize($tmp);
        $total += $size;
        if ($total > MAX_TOTAL) respond(false, 'toobig', 413);
        $type = detectType($tmp, (string)$_FILES['files']['type'][$i], (string)$_FILES['files']['name'][$i]);
        if (!in_array($type, OK_TYPES, true)) respond(false, 'filetype', 415);
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$_FILES['files']['name'][$i]) ?? '';
        $name = mb_substr(trim($name, '-.'), 0, 80);
        if ($name === '') $name = 'file-' . ($i + 1);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic',
                'image/heif' => 'heif', 'image/avif' => 'avif', 'application/pdf' => 'pdf', 'application/msword' => 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx'][$type] ?? 'bin';
        $name = preg_replace('/\.[A-Za-z0-9]+$/', '', $name) . '.' . $ext;
        $attach[] = ['name' => $name, 'type' => $type, 'data' => (string)file_get_contents($tmp)];
    }
}

$who = trim($first . ' ' . $last);
$whoHdr = nameSafe($who); // for headers: no < > " , ; : and backslash
$subject = ($trap ? '[check: hidden field] ' : '') . ($fast ? '[check: fast] ' : '') . 'Onboarding: ' . $place . ' (' . $who . ')';

$lines = [
    'A new client finished onboarding at domin8temedia.com/onboarding.',
    '',
    'Name:    ' . $who,
    'Place:   ' . $place,
    'Email:   ' . $email,
    'Mobile:  ' . ($mobile !== '' ? $mobile : 'not given'),
    '',
    str_repeat('-', 52),
    $summary,
    str_repeat('-', 52),
    'Attached: ' . (count($attach) ? implode(', ', array_column($attach, 'name')) : 'no files'),
    'Sent: ' . date('Y-m-d H:i:s T'),
    'IP:   ' . headerSafe((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 60),
    'Reply directly to this message to answer ' . $first . '.',
];
if ($answers !== '') {
    array_push($lines, '', 'Raw answers, for the records:', $answers);
}
$text = implode("\n", $lines);

$headers = [
    'From: Domin8te Onboarding <' . MAIL_FROM . '>',
    'Reply-To: ' . ($whoHdr !== '' ? '"' . $whoHdr . '" <' . $email . '>' : $email),
    'MIME-Version: 1.0',
    'X-Mailer: domin8te-onboarding',
];

if (!$attach) {
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: 8bit';
    $body = $text;
} else {
    $b = 'd8-' . bin2hex(random_bytes(12));
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $b . '"';
    $body = "This is a multipart message.\r\n\r\n"
        . '--' . $b . "\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text)) . "\r\n";
    foreach ($attach as $a) {
        $body .= '--' . $b . "\r\n"
            . 'Content-Type: ' . $a['type'] . '; name="' . $a['name'] . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $a['name'] . "\"\r\n\r\n"
            . chunk_split(base64_encode($a['data'])) . "\r\n";
    }
    $body .= '--' . $b . "--\r\n";
}

@touch($rateFile);
/* The private settings file (the same one /send.php reads): ['user' => mailbox, 'pass' => ..., and optionally
   'intake_url' and 'intake_secret' for the console hand-off]. It sits above public_html, so no deploy or backup has it. */
$cfg = null;
$cfgFile = dirname(__DIR__, 2) . '/d8-mail.php';
if (is_file($cfgFile)) { $c = include $cfgFile; if (is_array($c)) $cfg = $c; }

$sent = false;
if ($cfg) {
    $smtpHeaders = array_values(array_filter($headers, function ($h) { return stripos($h, 'From:') !== 0; }));
    $sent = smtpSend($cfg, MAIL_TO, $subject, $body, $smtpHeaders, 'Domin8te Onboarding');
    if (!$sent) error_log('d8-onboarding smtp not used or failed, falling back to mail()');
}
if (!$sent) {
    $sent = @mail(
        MAIL_TO,
        '=?UTF-8?B?' . base64_encode($subject) . '?=',
        $body,
        implode("\r\n", $headers),
        '-f' . MAIL_FROM
    );
}

/* Trace: no personal data, just enough to match a complaint to a line (email hash, size). */
error_log('d8-onboarding ' . date('c') . ' mail=' . ($sent ? 'ok' : 'FAIL') . ' email_sha1=' . sha1(strtolower($email)) . ' bytes=' . strlen($body));

if (!$sent) {
    /* Keep the answers if a private folder already exists above the web root. Never creates one. */
    $priv = dirname(__DIR__, 2) . '/private';
    if (is_dir($priv) && is_writable($priv)) {
        $keep = $priv . '/onboarding-failed-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.eml';
        $eml = 'To: ' . MAIL_TO . "\r\n" . 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=' . "\r\n"
            . implode("\r\n", $headers) . "\r\n\r\n" . $body;
        if (@file_put_contents($keep, $eml, LOCK_EX) !== false) @chmod($keep, 0600);
    }
    @unlink($rateFile); // let them retry straight away
    respond(false, 'send', 500);
}

if ($sidFile !== '') @touch($sidFile);

/* 1. The client's confirmation, so they know it arrived and what happens next. Signed mailbox only (mail() would land
   in spam), never for a post tagged as suspicious. */
if ($cfg && !$trap && !$fast) {
    $conf = ['Hi ' . $first . ',', '', 'Thanks, your setup answers for ' . $place . ' reached me.'];
    if ($slot !== '') array_push($conf, '', 'You picked a kickoff call for ' . $slot . '. I will confirm the time by email within one working day.');
    array_push($conf,
        '',
        'What happens next:',
        '1. I accept the access invites you sent (Google listing, Facebook and Instagram). If one did not go through, we sort it on the call.',
        '2. You get an email with your Domin8te dashboard. You sign in with this email address and a 6-digit code. No password.',
        '3. On the kickoff call we go through your first month together.',
        '',
        'Anything to add or change? Just reply to this email.',
        '',
        'Karan',
        'Domin8te Media',
        'domin8temedia.com'
    );
    $confHeaders = [
        'Reply-To: ' . (string)($cfg['user'] ?? MAIL_TO),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'Auto-Submitted: auto-replied',
    ];
    if (!smtpSend($cfg, $email, 'Got your setup answers for ' . $place, implode("\n", $conf), $confHeaders, 'Karan at Domin8te Media')) {
        error_log('d8-onboarding client confirmation failed');
    }
}

/* 2. The console hand-off: the answers become a "New setup form" on Needs you. Server to server, 6 s at most.
   Only a Supabase onboarding-intake address is accepted, so the settings file cannot point the answers anywhere else. */
$iu = $cfg ? (string)($cfg['intake_url'] ?? '') : '';
$is = $cfg ? (string)($cfg['intake_secret'] ?? '') : '';
if ($iu !== '' && $is !== '' && !$trap && preg_match('#^https://[a-z0-9]+\.supabase\.co/functions/v1/onboarding-intake$#', $iu)) {
    $payload = json_encode(['sid' => $sid, 'first' => $first, 'last' => $last, 'email' => $email, 'mobile' => $mobile,
        'place' => $place, 'summary' => $summary, 'answers' => $answers], JSON_UNESCAPED_UNICODE);
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 6, 'ignore_errors' => true,
        'header' => "Content-Type: application/json\r\nx-onboarding-secret: " . $is . "\r\n", 'content' => (string)$payload]]);
    @file_get_contents($iu, false, $ctx);
    $code = (isset($http_response_header[0]) && preg_match('/\s(\d{3})(\s|$)/', $http_response_header[0], $mm)) ? $mm[1] : '---';
    error_log('d8-onboarding intake ' . ($code === '200' ? 'ok' : 'FAILED ' . $code) . ' email_sha1=' . sha1(strtolower($email)));
}

respond(true);

