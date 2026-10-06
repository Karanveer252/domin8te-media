/* ============================================================
   Version 3: the form's "What needs fixing first?" list (Karan,
   2026-10-06: "make this better, and match the design of the
   website"). The browser's own list was a blue-and-white system
   menu; this draws the site's own: a soft sand card on the page's
   card shadow, the choices in the text face, the picked one marked
   with the orange of the buttons.

   The real <select> stays in the form, hidden, and stays the truth:
   the form sends it, the plan's buttons set it (site.js tells us with
   a change event), a reset clears it. This is only its face. It
   speaks the listbox pattern: arrows, Home, End, Enter, Space,
   Escape, Tab and type-to-find, the open list announced as such.
   ============================================================ */
(function () {
'use strict';

var sel = document.getElementById('f-need');
if (!sel || !document.querySelector) return;
var field = sel.closest('.field'), label = field && field.querySelector('label[for="f-need"]');
if (!field) return;

var ID = 'f-need';
var hint = sel.options[0].value === '' ? sel.options[0].text : '';  /* "Pick one" is the prompt, not a choice */
var choices = [].slice.call(sel.options).filter(function (o) { return !(o.index === 0 && o.value === '') });

var wrap = document.createElement('div');
wrap.className = 'v3sel';
var btn = document.createElement('button');
btn.type = 'button';
btn.className = 'v3sel__btn';
btn.id = ID + '-btn';
btn.setAttribute('aria-haspopup', 'listbox');
btn.setAttribute('aria-expanded', 'false');
btn.innerHTML = '<span class="v3sel__val"></span><svg class="v3sel__chev" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true"><path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var val = btn.querySelector('.v3sel__val');

var list = document.createElement('ul');
list.className = 'v3sel__list';
list.id = ID + '-list';
list.setAttribute('role', 'listbox');
list.tabIndex = -1;
choices.forEach(function (o, i) {
  var li = document.createElement('li');
  li.className = 'v3sel__opt';
  li.id = ID + '-o' + i;
  li.setAttribute('role', 'option');
  li.innerHTML = '<span class="v3sel__txt"></span><svg class="v3sel__tick" width="14" height="11" viewBox="0 0 14 11" aria-hidden="true"><path d="M1.5 5.8l3.6 3.6L12.5 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  li.querySelector('.v3sel__txt').textContent = o.text;
  li._o = o;
  list.appendChild(li);
});
var items = [].slice.call(list.children);

if (label) {
  if (!label.id) label.id = ID + '-lbl';
  label.htmlFor = btn.id;
  btn.setAttribute('aria-labelledby', label.id + ' ' + btn.id);
  list.setAttribute('aria-labelledby', label.id);
}
sel.parentNode.insertBefore(wrap, sel);
wrap.appendChild(sel);
wrap.appendChild(btn);
wrap.appendChild(list);
sel.classList.add('v3sel__native');
sel.tabIndex = -1;
sel.setAttribute('aria-hidden', 'true');
field.classList.add('has-v3sel');

var open = false, active = -1;
function picked() { for (var i = 0; i < items.length; i++) if (items[i]._o.selected && !(items[i]._o.index === 0 && items[i]._o.value === '')) return i; return -1 }
function sync() {
  var p = picked();
  val.textContent = p < 0 ? hint : items[p]._o.text;
  btn.classList.toggle('is-empty', p < 0);
  items.forEach(function (li, i) { li.setAttribute('aria-selected', i === p ? 'true' : 'false') });
}
function mark(i, scroll) {
  active = i;
  items.forEach(function (li, k) { li.classList.toggle('is-active', k === i) });
  if (i < 0) { list.removeAttribute('aria-activedescendant'); return }
  list.setAttribute('aria-activedescendant', items[i].id);
  if (scroll) items[i].scrollIntoView({ block: 'nearest' });
}
function show() {
  if (open) return;
  open = true;
  /* below the field, unless the screen has no room there and more above */
  var r = btn.getBoundingClientRect(), need = Math.min(360, items.length * 52 + 16);
  wrap.classList.toggle('is-up', window.innerHeight - r.bottom < need + 16 && r.top > window.innerHeight - r.bottom);
  wrap.classList.add('is-open');
  btn.setAttribute('aria-expanded', 'true');
  mark(Math.max(0, picked()), true);
  list.focus({ preventScroll: true });
}
function hide(refocus) {
  if (!open) return;
  open = false;
  wrap.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
  mark(-1);
  if (refocus) btn.focus({ preventScroll: true });
}
function choose(i) {
  if (i < 0) return;
  var o = items[i]._o;
  if (!o.selected) { sel.selectedIndex = o.index; sel.dispatchEvent(new Event('change', { bubbles: true })) }
  sync();
  hide(true);
}

btn.addEventListener('click', function () { open ? hide(true) : show() });
btn.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show() }
});
var typed = '', typedAt = 0;
list.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === 'ArrowDown') { e.preventDefault(); mark(Math.min(items.length - 1, active + 1), true) }
  else if (k === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, active - 1), true) }
  else if (k === 'Home' || k === 'PageUp') { e.preventDefault(); mark(0, true) }
  else if (k === 'End' || k === 'PageDown') { e.preventDefault(); mark(items.length - 1, true) }
  else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active) }
  else if (k === 'Escape') { e.preventDefault(); hide(true) }
  else if (k === 'Tab') { hide(false) }
  else if (k.length === 1 && /\S/.test(k)) {
    var now = Date.now();
    typed = (now - typedAt > 700 ? '' : typed) + k.toLowerCase(); typedAt = now;
    for (var n = 0; n < items.length; n++) {
      var i = (active + (typed.length > 1 ? 0 : 1) + n) % items.length;
      if (items[i]._o.text.toLowerCase().indexOf(typed) === 0) { mark(i, true); break }
    }
  }
});
list.addEventListener('mousemove', function (e) {
  var li = e.target.closest('.v3sel__opt');
  if (li && items.indexOf(li) !== active) mark(items.indexOf(li));
});
list.addEventListener('click', function (e) {
  var li = e.target.closest('.v3sel__opt');
  if (li) choose(items.indexOf(li));
});
document.addEventListener('pointerdown', function (e) { if (open && !wrap.contains(e.target)) hide(false) }, true);
list.addEventListener('focusout', function (e) { if (open && !wrap.contains(e.relatedTarget)) hide(false) });

sel.addEventListener('change', sync);                                 /* the plan's buttons pick for the owner */
if (sel.form) sel.form.addEventListener('reset', function () { setTimeout(sync, 0) });
sync();
})();
