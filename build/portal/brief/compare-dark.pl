#!/usr/bin/perl
# Adds a Dark toggle (key K) to compare.html for the round-2 directions.
use strict; use warnings; local $/;
my $f = 'compare.html';
open my $fh, '<:raw', $f or die; my $t = <$fh>; close $fh;
die "already has a dark toggle\n" if $t =~ /darkBtn/;
my $n = 0;
$n += $t =~ s/\.widths button, \.notes-btn, \.rail-btn, \.open \{/.widths button, .notes-btn, .rail-btn, .dark-btn, .open {/;
$n += $t =~ s/\.widths button\[aria-pressed="true"\], \.rail-btn\[aria-pressed="true"\] \{/.widths button[aria-pressed="true"], .rail-btn[aria-pressed="true"], .dark-btn[aria-pressed="true"] {/;
$n += $t =~ s/\.rail-btn\[disabled\] \{/.rail-btn[disabled], .dark-btn[disabled] {/;
$n += $t =~ s/(<button class="rail-btn"[^>]*>Rail<\/button>)/$1\n  <button class="dark-btn" id="darkBtn" aria-pressed="false" title="Show the dark theme (directions 11 to 15)">Dark<\/button>/;
$n += $t =~ s/var N = D\.length, cur = 0, width = 1440, rail = false;/var N = D.length, cur = 0, width = 1440, rail = false, dark = false;/;
$n += $t =~ s/railBtn = document\.getElementById\('railBtn'\);/railBtn = document.getElementById('railBtn'), darkBtn = document.getElementById('darkBtn');/;
$n += $t =~ s/rail = localStorage\.getItem\('portal\.rail'\) === '1'; \}/rail = localStorage.getItem('portal.rail') === '1'; dark = localStorage.getItem('portal.dark') === '1'; }/;
$n += $t =~ s/function src\(d\) \{ return 'versions\/v' \+ d\.n \+ '\.html' \+ \(rail && d\.round2 \? '\?side=rail' : ''\); \}/function src(d) { var q = []; if (d.round2) { if (rail) q.push('side=rail'); q.push('theme=' + (dark ? 'dark' : 'light')); } return 'versions\/v' + d.n + '.html' + (q.length ? '?' + q.join('&') : ''); }/;
$n += $t =~ s/railBtn\.disabled = !d\.round2; railBtn\.setAttribute\('aria-pressed', rail && d\.round2 \? 'true' : 'false'\);/railBtn.disabled = !d.round2; railBtn.setAttribute('aria-pressed', rail && d.round2 ? 'true' : 'false'); darkBtn.disabled = !d.round2; darkBtn.setAttribute('aria-pressed', dark && d.round2 ? 'true' : 'false');/;
$n += $t =~ s/(  function setRail\(on\) \{[^\n]*\n)/$1  function setDark(on) { dark = on; try { localStorage.setItem('portal.dark', on ? '1' : '0'); localStorage.setItem('portal.theme', on ? 'dark' : 'light'); } catch (e) {} go(cur); }\n/;
$n += $t =~ s/(  railBtn\.addEventListener\('click'[^\n]*\n)/$1  darkBtn.addEventListener('click', function () { if (!darkBtn.disabled) setDark(!dark); });\n/;
$n += $t =~ s/else if \(k === 's'\) \{ if \(D\[cur\]\.round2\) setRail\(!rail\); \}/else if (k === 's') { if (D[cur].round2) setRail(!rail); } else if (k === 'k') { if (D[cur].round2) setDark(!dark); }/;
$n += $t =~ s/S toggles the rail · N toggles notes/S toggles the rail · K toggles dark · N toggles notes/;
$n += $t =~ s/collapses it to icons\.<\/p>/collapses it to icons; the sun and moon button in the top row (or the Dark toggle above) switches the theme, and with no choice the page follows the system.<\/p>/;
die "only $n of 14 edits applied\n" unless $n == 14;
open my $out, '>:raw', $f or die; print $out $t; close $out;
print "compare.html: 14 edits applied\n";
