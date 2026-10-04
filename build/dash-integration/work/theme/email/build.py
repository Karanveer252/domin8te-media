"""Builds the Domin8te Clerk email templates and a local preview from one shared layout.

    python email/build.py

Writes, for each email in EMAILS:
  email/clerk/<slug>.html          Revolvapp markup to paste into Clerk (Customization > Emails)
  assets/email/header-<label>.png  the header lockup, uploaded to domin8temedia.com/assets/email/
and email/preview.html, every email stacked with sample values (local only, not deployed).

Header: the website (dot grid, thin uppercase wordmark, the rising spectrum line).
Body: the portal and console (warm paper, white card, Schibsted Grotesk, one orange).
"""
import html, io, os, re
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://domin8temedia.com'
PORTAL = SITE + '/dashboard/'
HELP = 'karanhelps@domin8temedia.com'

C = dict(paper='#F4F1EC', card='#FFFFFF', line='#E6E0D7', ink='#1D1A16', ink2='#4A443D',
         ink3='#6B645B', accent='#FF5B1F', accent_ink='#AE3A0B')
FONT = '"Schibsted Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif'

HELP_LINK = f'<a href="mailto:{HELP}" style="color:{C["accent_ink"]}">{HELP}</a>'
IGNORE = "If you didn't request this, you can ignore this email."
NOT_YOU = f'Not you? Contact {HELP_LINK}.'

# Each email: Clerk slug, subject, preheader, header label, then body blocks.
# Blocks: ('h1', t) ('p', t) ('code', var) ('button', label, href) ('fallback', href) ('note', t) ('fine', t)
def code_email(slug, label, subject, h1, p):
    return dict(slug=slug, label=label, subject=subject, pre=p,
                body=[('h1', h1), ('p', p), ('code', '{{otp_code}}'), ('note', 'Expires in 10 minutes. ' + IGNORE)])

def link_email(slug, label, subject, h1, p, cta, href, note=IGNORE):
    return dict(slug=slug, label=label, subject=subject, pre=p,
                body=[('h1', h1), ('p', p), ('button', cta, href), ('note', note), ('fallback', href)])

def notice(slug, subject, h1, p):
    return dict(slug=slug, label='SECURITY NOTICE', subject=subject, pre=p,
                body=[('h1', h1), ('p', p), ('fine', NOT_YOU)])

EMAILS = [
    code_email('verification_code', 'SIGN-IN CODE', '{{otp_code}} is your Domin8te sign-in code',
               'Your sign-in code', 'Enter this code to sign in to Domin8te.'),
    code_email('reset_password_code', 'PASSWORD RESET', '{{otp_code}} is your Domin8te reset code',
               'Reset your password', 'Enter this code to set a new password.'),
    link_email('magic_link_sign_in', 'SIGN-IN LINK', 'Sign in to Domin8te',
               'Sign in to Domin8te', 'Use the button below to sign in.', 'Sign in', '{{magic_link}}'),
    link_email('magic_link_sign_up', 'CONFIRM EMAIL', 'Confirm your email',
               'Confirm your email', 'Use the button below to finish creating your account.', 'Confirm email', '{{magic_link}}'),
    link_email('magic_link_user_profile', 'VERIFY EMAIL', 'Verify your email',
               'Verify your email', 'Use the button below to add this email to your account.', 'Verify email', '{{magic_link}}'),
    link_email('invitation', 'INVITATION', "You're invited to Domin8te",
               "You're invited to Domin8te", 'Accept to access your client portal.', 'Accept invitation', '{{action_url}}',
               'This invitation expires in {{invitation.expires_in_days}} days.'),
    link_email('organization_invitation', 'INVITATION', 'Join {{org.name}} on Domin8te',
               'Join {{org.name}}', "You've been invited to {{org.name}} on Domin8te.", 'Accept invitation', '{{action_url}}'),
    notice('password_changed', 'Your Domin8te password was changed',
           'Password changed', 'Your Domin8te password was just changed.'),
    notice('password_removed', 'Your Domin8te password was removed',
           'Password removed', 'Your Domin8te account no longer has a password. You will sign in with an emailed code.'),
    notice('primary_email_address_changed', 'Your Domin8te email was changed',
           'Email changed', 'The sign-in email on your Domin8te account was just changed.'),
    notice('new_device_sign_in', 'New sign-in to Domin8te',
           'New sign-in', 'Your Domin8te account was just signed in to from a new device.'),
    notice('passkey_added', 'Passkey added to your Domin8te account',
           'Passkey added', 'A passkey was added to your Domin8te account.'),
    notice('passkey_removed', 'Passkey removed from your Domin8te account',
           'Passkey removed', 'A passkey was removed from your Domin8te account.'),
]

SAMPLE = {'{{otp_code}}': '084357', '{{requested_from}}': '216.130.85.197, Winnipeg, Canada',
          '{{requested_at}}': '02 October 2026, 12:24 CDT', '{{magic_link}}': SITE + '/dashboard/#/verify?token=…',
          '{{action_url}}': SITE + '/dashboard/#/accept?ticket=…', '{{invitation.expires_in_days}}': '30',
          '{{org.name}}': 'Your Restaurant', '{{current_year}}': '2026'}


# ---- header images -------------------------------------------------------------------------

def _font(name, size):
    f = TTFont(os.path.join(ROOT, 'assets', 'fonts', name)); f.flavor = None
    b = io.BytesIO(); f.save(b); b.seek(0)
    return ImageFont.truetype(b, size)

STOPS = [(0, '#E5322B'), (.13, '#F2912F'), (.26, '#F3CB3C'), (.40, '#5CB246'), (.55, '#0FA3C2'),
         (.70, '#2E5FA8'), (.85, '#7A3E97'), (1, '#D51C73')]

def _spectrum(t):
    rgb = [(a, tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))) for a, c in STOPS]
    for (a, ca), (b, cb) in zip(rgb, rgb[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))

def _tracked(d, x, y, text, font, track, fill):
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill); x += font.getlength(ch) + track

def header_file(label):
    return 'header-' + re.sub(r'[^a-z]+', '-', label.lower()).strip('-') + '.png'

def make_header(label):
    S = 2; W, H = 600 * S, 112 * S; lh = 3 * S
    im = Image.new('RGB', (W, H), (10, 10, 10)); d = ImageDraw.Draw(im)
    for y in range(14 * S, H, 28 * S):  # the site's 28px dot grid
        for x in range(14 * S, W, 28 * S):
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(38, 37, 35))
    for x in range(W):  # the rising line, laid flat
        d.line([(x, H - lh), (x, H - 1)], fill=_spectrum(x / (W - 1)))
    cy = (H - lh) // 2
    m = Image.open(os.path.join(ROOT, 'assets', 'mark-720.webp')).convert('RGBA')
    mh = 30 * S; mw = round(m.width * mh / m.height); m = m.resize((mw, mh), Image.LANCZOS)
    mx = 40 * S; im.paste(m, (mx, cy - mh // 2), m)
    f = _font('bvp-200.woff2', 26 * S); bb = f.getbbox('D')
    _tracked(d, mx + mw + 16 * S, cy - (bb[1] + bb[3]) // 2, 'DOMIN8TE', f, round(.04 * 26 * S), (237, 234, 228))
    f2 = _font('bvp-600.woff2', 11 * S); tr = round(.14 * 11 * S); bb = f2.getbbox('S')
    lw = sum(f2.getlength(c) + tr for c in label) - tr
    _tracked(d, W - 40 * S - lw, cy - (bb[1] + bb[3]) // 2, label, f2, tr, (143, 140, 134))
    im.save(os.path.join(ROOT, 'assets', 'email', header_file(label)), optimize=True)


# ---- Clerk (Revolvapp) markup --------------------------------------------------------------

STYLE = f'''      body, td, p, h1, a {{ font-family: {FONT}; }}
      .otp {{ letter-spacing: 12px; font-variant-numeric: tabular-nums; }}
      .label {{ letter-spacing: 1.6px; text-transform: uppercase; }}
      .cta {{ letter-spacing: 1.5px; text-transform: uppercase; }}
      .url {{ word-break: break-all; }}
      @media (max-width: 620px) {{
        .otp {{ font-size: 34px !important; letter-spacing: 8px !important; }}
      }}'''

FOOTER_LINE = f'&copy; {{{{current_year}}}} Domin8te Media &nbsp;·&nbsp; <a href="{SITE}" style="color:{C["ink3"]}">domin8temedia.com</a>'

def clerk_block(b):
    k = b[0]
    if k == 'h1':
        return f'<re-heading level="h1" color="{C["ink"]}" font-weight="600" margin="0 0 12px">{b[1]}</re-heading>'
    if k == 'p':
        return f'<re-text color="{C["ink2"]}" font-size="16px" line-height="1.55" margin="0 0 28px">{b[1]}</re-text>'
    if k == 'code':
        return (f'<re-block background-color="{C["paper"]}" padding="22px 28px">\n'
                f'          <re-text class="label" color="{C["ink3"]}" font-size="11px" font-weight="600" margin="0 0 6px">Code</re-text>\n'
                f'          <re-text class="otp" color="{C["ink"]}" font-size="40px" font-weight="700" line-height="1.1" margin="0">{b[1]}</re-text>\n'
                f'        </re-block>\n'
                f'        <re-divider height="3px" width="64px" background-color="{C["accent"]}"></re-divider>')
    if k == 'button':
        return (f'<re-button class="cta" href="{b[2]}" background-color="{C["accent"]}" color="{C["ink"]}" '
                f'font-size="13px" font-weight="600" border-radius="0" margin="0">{b[1]}</re-button>')
    if k == 'fallback':
        return (f'<re-spacer height="28px"></re-spacer>\n'
                f'        <re-divider height="1px" background-color="{C["line"]}"></re-divider>\n'
                f'        <re-text class="url" color="{C["ink3"]}" font-size="12px" line-height="1.55" margin="16px 0 0">Or open this link: <a href="{b[1]}" style="color:{C["ink3"]}">{b[1]}</a></re-text>')
    if k == 'note':
        return f'<re-text color="{C["ink3"]}" font-size="14px" line-height="1.55" margin="24px 0 0">{b[1]}</re-text>'
    if k == 'fine':
        return f'<re-text color="{C["ink3"]}" font-size="14px" line-height="1.55" margin="0">{b[1]}</re-text>'

def clerk(e):
    body = '\n        '.join(clerk_block(b) for b in e['body'])
    return f'''<re-html>
  <re-head>
    <re-title>{e["subject"]}</re-title>
    <re-font href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700&display=swap"></re-font>
    <re-style>
{STYLE}
    </re-style>
  </re-head>
  <re-body background-color="{C["paper"]}" padding="40px 12px 48px">
    <re-preheader>{e["pre"]}</re-preheader>
    <re-container width="600px">

      <re-header background-color="#0A0A0A" padding="0">
        <re-image src="{SITE}/assets/email/{header_file(e["label"])}" width="600px" alt="Domin8te"></re-image>
      </re-header>

      <re-main background-color="{C["card"]}" padding="44px 44px 40px" border="1px solid {C["line"]}">
        {body}
      </re-main>

      <re-footer padding="24px 4px 0">
        <re-text color="{C["ink3"]}" font-size="12px" line-height="1.55" margin="0">{FOOTER_LINE}</re-text>
      </re-footer>

    </re-container>
  </re-body>
</re-html>
'''


# ---- local preview (plain table HTML, sample values) ---------------------------------------

def p(style, text, cls=''):
    c = f' class="{cls}"' if cls else ''
    return f'<p{c} style="margin:{style}">{text}</p>'

def preview_block(b):
    k = b[0]
    if k == 'h1':
        return f'<h1 style="margin:0 0 12px;color:{C["ink"]};font-size:28px;font-weight:600;line-height:1.2">{b[1]}</h1>'
    if k == 'p':
        return p(f'0 0 28px;color:{C["ink2"]};font-size:16px;line-height:1.55', b[1])
    if k == 'code':
        return (f'<div style="background:{C["paper"]};padding:22px 28px">'
                + p(f'0 0 6px;color:{C["ink3"]};font-size:11px;font-weight:600', 'Code', 'label')
                + p(f'0;color:{C["ink"]};font-size:40px;font-weight:700;line-height:1.1', b[1], 'otp')
                + f'</div><div style="width:64px;height:3px;background:{C["accent"]}"></div>')
    if k == 'button':
        return (f'<a class="cta" href="{b[2]}" style="display:inline-block;background:{C["accent"]};color:{C["ink"]};'
                f'font-size:13px;font-weight:600;text-decoration:none;padding:18px 28px;line-height:1">{b[1]}</a>')
    if k == 'fallback':
        return (f'<div style="height:28px"></div><div style="height:1px;background:{C["line"]}"></div>'
                + p(f'16px 0 0;color:{C["ink3"]};font-size:12px;line-height:1.55', f'Or open this link: <a href="{b[1]}" style="color:{C["ink3"]}">{b[1]}</a>', 'url'))
    if k == 'note':
        return p(f'24px 0 0;color:{C["ink3"]};font-size:14px;line-height:1.55', b[1])
    if k == 'fine':
        return p(f'0;color:{C["ink3"]};font-size:14px;line-height:1.55', b[1])

def fill(s):
    for k, v in SAMPLE.items():
        s = s.replace(k, v)
    return s

def preview_email(e):
    body = ''.join(preview_block(b) for b in e['body'])
    return fill(f'''
<section id="{e["slug"]}" class="email">
  <div class="meta"><code>{e["slug"]}</code><span>{e["subject"]}</span></div>
  <div class="frame">
    <img src="../assets/email/{header_file(e["label"])}" width="600" alt="Domin8te" style="display:block;width:100%;height:auto">
    <div class="main" style="background:{C["card"]};border:1px solid {C["line"]};border-top:0;padding:44px 44px 40px">{body}</div>
    <div style="padding:24px 4px 0">
      {p(f'0;color:{C["ink3"]};font-size:12px;line-height:1.55', FOOTER_LINE)}
    </div>
  </div>
</section>''')

def preview():
    nav = ''.join(f'<a href="#{e["slug"]}">{e["slug"]}</a>' for e in EMAILS)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Domin8te emails</title>
<!-- Generated by email/build.py. Local preview with sample values; not deployed. -->
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body {{ margin: 0; background: {C["paper"]}; color: {C["ink"]}; }}
  body, td, p, h1, a {{ font-family: {FONT}; }}
  .otp {{ letter-spacing: 12px; font-variant-numeric: tabular-nums; }}
  .label {{ letter-spacing: 1.6px; text-transform: uppercase; }}
  .cta {{ letter-spacing: 1.5px; text-transform: uppercase; }}
  .url {{ word-break: break-all; }}
  nav {{ max-width: 600px; margin: 0 auto; padding: 32px 12px 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; }}
  nav a {{ color: {C["ink3"]}; }}
  .email {{ max-width: 600px; margin: 0 auto; padding: 40px 12px 56px; border-bottom: 1px dashed {C["line"]}; }}
  .meta {{ display: flex; gap: 12px; align-items: baseline; margin-bottom: 12px; font-size: 13px; color: {C["ink3"]}; flex-wrap: wrap; }}
  .meta code {{ color: {C["ink"]}; font-weight: 600; }}
  @media (max-width: 620px) {{
    .main {{ padding: 32px 24px 28px !important; }}
    .otp {{ font-size: 34px !important; letter-spacing: 8px !important; }}
  }}
</style>
</head>
<body>
<nav>{nav}</nav>
{"".join(preview_email(e) for e in EMAILS)}
</body>
</html>
'''


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'email', 'clerk'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'assets', 'email'), exist_ok=True)
    for label in sorted({e['label'] for e in EMAILS}):
        make_header(label)
    for e in EMAILS:
        with open(os.path.join(ROOT, 'email', 'clerk', e['slug'] + '.html'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(clerk(e))
    with open(os.path.join(ROOT, 'email', 'preview.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(preview())
    print(f'{len(EMAILS)} templates, {len({e["label"] for e in EMAILS})} headers, preview written')
