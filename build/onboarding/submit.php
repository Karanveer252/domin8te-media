<?php
declare(strict_types=1);

/* ============================================================
   Domin8te Media onboarding handler
   Mails a new client's setup answers, plus their menu file if they
   attached one, to the business mailbox on the same Hostinger server.
   Same approach as /send.php: PHP mail(), no stored credentials.
   Only ever sends to MAIL_TO; replying to the email replies to the client.
   ============================================================ */

const MAIL_TO   = 'karanhelps@domin8temedia.com';
const MAIL_FROM = 'website@domin8temedia.com';
const MAX_FILES = 3;
const MAX_TOTAL = 6291456; // 6 MB of files in total: base64 makes that about 8.4 MB in the mail, under the usual 10 MB limit
const RATE_SECS = 30;      // one send per IP per this many seconds
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

/* Bots fill hidden fields. Humans never see this one. */
if (trim((string)($_POST['company_url'] ?? '')) !== '') {
    respond(true); // look successful, deliver nothing
}

/* Time trap: the page sends ms since the visit began. Too fast to be a person. */
$t = $_POST['t'] ?? null;
if (is_string($t) && $t !== '' && is_numeric($t) && (float)$t < MIN_MS) {
    respond(true); // look successful, deliver nothing
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

if ($first === '' || $place === '' || $summary === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || preg_match('/[<>",;\\\\\\s]/', $email)) { // no quoted or odd addresses in a header
    respond(false, 'missing', 422);
}

/* Duplicate guard: the page sends one random id per submission. If we already sent it, say ok and stop. */
$sid = (string)($_POST['sid'] ?? '');
$sidFile = preg_match('/^[A-Za-z0-9-]{8,64}$/', $sid) ? sys_get_temp_dir() . '/d8ob-sid-' . sha1($sid) : '';
if ($sidFile !== '' && is_file($sidFile)) {
    respond(true);
}

/* Throttle: one send per IP per RATE_SECS. Cleared again if the mail fails, so a retry is not blocked. */
$rateFile = sys_get_temp_dir() . '/d8ob-rate-' . sha1((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
if (is_file($rateFile) && time() - (int)@filemtime($rateFile) < RATE_SECS) {
    respond(false, 'rate', 429);
}
@touch($rateFile);

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
        $attach[] = ['name' => $name, 'type' => $type, 'data' => (string)file_get_contents($tmp)];
    }
}

$who = trim($first . ' ' . $last);
$whoHdr = nameSafe($who); // for headers: no < > " , ; : and backslash
$subject = 'Onboarding: ' . $place . ' (' . $who . ')';

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

$sent = @mail(
    MAIL_TO,
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $body,
    implode("\r\n", $headers),
    '-f' . MAIL_FROM
);

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
respond(true);
