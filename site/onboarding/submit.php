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
const MAX_TOTAL = 10485760; // 10 MB across all files
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

/* Bots fill hidden fields. Humans never see this one. */
if (trim((string)($_POST['company_url'] ?? '')) !== '') {
    respond(true); // look successful, deliver nothing
}

/* Strip CR and LF from anything that touches a mail header. */
function headerSafe(string $v, int $max = 200): string {
    $v = str_replace(["\r", "\n", "\0", '%0a', '%0d', '%0A', '%0D'], ' ', $v);
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
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

if ($first === '' || $place === '' || $summary === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'missing', 422);
}

/* Attached files: images, PDFs and Word documents only, checked by content. */
function detectType(string $path, string $claimed): string {
    if (class_exists('finfo')) {
        $t = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (is_string($t) && $t !== '') return $t;
    }
    if (function_exists('mime_content_type')) {
        $t = mime_content_type($path);
        if (is_string($t) && $t !== '') return $t;
    }
    return $claimed;
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
        $type = detectType($tmp, (string)$_FILES['files']['type'][$i]);
        if (!in_array($type, OK_TYPES, true)) respond(false, 'filetype', 415);
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$_FILES['files']['name'][$i]) ?? '';
        $name = mb_substr(trim($name, '-.'), 0, 80);
        if ($name === '') $name = 'file-' . ($i + 1);
        $attach[] = ['name' => $name, 'type' => $type, 'data' => (string)file_get_contents($tmp)];
    }
}

$who = trim($first . ' ' . $last);
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
    'Reply-To: ' . $who . ' <' . $email . '>',
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

if (!$sent) {
    respond(false, 'send', 500);
}

respond(true);
