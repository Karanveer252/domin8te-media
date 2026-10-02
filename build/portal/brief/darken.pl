#!/usr/bin/perl
# Adds a dark theme to a round-2 direction file without changing its light rendering.
# Usage: perl darken.pl <file> <darkGroundHex>
# 1. Every literal white / ink-tint / warm-shadow rgba() in the <style> block becomes a --p- variable
#    seeded with the same value (light unchanged); pool colours likewise.
# 2. One dark token set is appended, applied by html[data-theme=dark] and by prefers-color-scheme
#    when no explicit theme is set.
# 3. Sparkline colours move to CSS; a sun/moon toggle joins the top row; the script learns ?theme=.
use strict; use warnings;
my ($file, $darkGround) = @ARGV;
die "usage: darken.pl <file> <#darkGround>\n" unless $file && $darkGround;
local $/;
open my $fh, '<:raw', $file or die "$file: $!"; my $t = <$fh>; close $fh;
die "already darkened\n" if $t =~ /data-theme=dark/;
my ($pre, $css, $post) = $t =~ /^(.*?<style>)(.*?)(<\/style>.*)$/s or die "no style block";

my (%w, %k, %sh, @pools);
sub key { my $a = shift; return sprintf('%02d', $a * 100 + 0.5); }

# pools first (their rgb differ per file): capture inside each .pool.X{...} rule
$css =~ s{(\.pool\.([a-z])\{[^\}]*\})}{
  my ($rule, $id) = ($1, $2); my $n = 0;
  $rule =~ s{rgba\((\d+),(\d+),(\d+),(\.\d+)\)}{
    $n++; my ($r,$g,$b,$a) = ($1,$2,$3,$4);
    my $dark = sprintf('%.2f', $a * 0.85); $dark =~ s/^0//;
    push @pools, ["--p-pool-$id-$n", "rgba($r,$g,$b,$a)", "rgba($r,$g,$b,$dark)"];
    "var(--p-pool-$id-$n)";
  }ge;
  $rule;
}ge;

# whites
$css =~ s{rgba\(255,255,255,(\.\d+)\)}{ my $a=$1; my $k=key($a); $w{$k}=$a; "var(--p-w-$k)" }ge;
# ink tints
$css =~ s{rgba\(28,26,23,(\.\d+)\)}{ my $a=$1; my $k=key($a); $k{$k}=$a; "var(--p-k-$k)" }ge;
# warm shadows and edges
$css =~ s{rgba\(70,45,20,(\.\d+)\)}{ my $a=$1; my $k=key($a); $sh{$k}=$a; "var(--p-s-$k)" }ge;
# flat whites
$css =~ s{color:#fff\b}{color:var(--p-ground)}gi;
$css =~ s{inset 0 1px 0 #fff\b}{inset 0 1px 0 var(--p-w-95)}gi;
$css =~ s{#fff\b}{var(--p-surface)}gi;
$css =~ s{#F4F1EB\b}{var(--p-well-2)}gi;
# light seeds into the token block
my $seed = "--p-surface:#FFFFFF;--p-well-2:#F4F1EB;";
$seed .= "--p-w-$_:rgba(255,255,255,$w{$_});" for sort keys %w;
$seed .= "--p-k-$_:rgba(28,26,23,$k{$_});" for sort keys %k;
$seed .= "--p-s-$_:rgba(70,45,20,$sh{$_});" for sort keys %sh;
$seed .= "$_->[0]:$_->[1];" for @pools;
$css =~ s/^\.portal\{/.portal{$seed/m or die "no .portal token block";
# dark values
my %wd = (95=>.14, 88=>.14, 80=>.12, 74=>.08, 72=>.10, 70=>.10, 66=>.07, 60=>.08, 55=>.08, 54=>.06, 50=>.05, 48=>.05, 35=>.06, 10=>.02);
my $dark = "--p-ground:$darkGround;--p-ink:#F3EEE6;--p-ink-2:#C4BBAF;--p-ink-3:#A39A8E;--p-hairline:rgba(255,255,255,.10);--p-hairline-strong:rgba(255,255,255,.2);--p-accent:#FF6A2F;--p-accent-hover:#FF8A57;--p-on-accent:#14110E;--p-accent-ink:#FFA37E;--p-line:#FF8A57;--p-focus:#F3EEE6;--p-needs:rgba(255,176,143,.16);--p-needs-ink:#FFB08F;--p-prog:rgba(140,184,242,.16);--p-prog-ink:#8CB8F2;--p-sched:rgba(179,184,194,.16);--p-sched-ink:#B3B8C2;--p-done:rgba(139,212,154,.16);--p-done-ink:#8BD49A;--p-paused:rgba(154,158,154,.16);--p-paused-ink:#9A9E9A;--p-solid:#221E19;--p-surface:#26211C;--p-white:rgba(255,255,255,.08);--p-well-2:rgba(255,255,255,.08);";
for (sort keys %w) { my $a = exists $wd{$_} ? $wd{$_} : sprintf('%.2f', $w{$_} * 0.15); $a =~ s/^0//; $dark .= "--p-w-$_:rgba(255,255,255,$a);"; }
for (sort keys %k) { my $a = sprintf('%.2f', $k{$_} * 1.3); $a =~ s/^0//; $dark .= "--p-k-$_:rgba(255,255,255,$a);"; }
for (sort keys %sh) { my $a = $sh{$_} * 1.3 + 0.2; $a = 0.7 if $a > 0.7; $a = sprintf('%.2f', $a); $a =~ s/^0//; $dark .= "--p-s-$_:rgba(0,0,0,$a);"; }
$dark .= "$_->[0]:$_->[2];" for @pools;
$dark .= "scrollbar-color:#4A443C $darkGround;color-scheme:dark";
my $base = "\n/* sparkline colours follow the theme */\n.spark polyline{stroke:var(--p-line)}.spark polygon{fill:var(--p-line)}.spark circle{fill:var(--p-line);stroke:var(--p-surface)}.spark.stale polyline{stroke:var(--p-ink-3)}.spark.stale polygon{fill:var(--p-ink-3)}.spark.stale circle{fill:var(--p-surface);stroke:var(--p-ink-3)}\n.theme-sun{display:none}\n";
my $rules = "/* dark theme: chosen by the toggle, or by the system when nothing is chosen */\nhtml[data-theme=dark] body{background:$darkGround}\nhtml[data-theme=dark] .portal{$dark}\nhtml[data-theme=dark] .portal .theme-moon{display:none}html[data-theme=dark] .portal .theme-sun{display:block}\n\@media (prefers-color-scheme:dark){html:not([data-theme=light]) body{background:$darkGround}html:not([data-theme=light]) .portal{$dark}html:not([data-theme=light]) .portal .theme-moon{display:none}html:not([data-theme=light]) .portal .theme-sun{display:block}}\n";
$css .= $base . $rules;

# markup: stale sparkline class, icons, toggle, script
$post =~ s{<svg class="spark"( [^>]*aria-label="[^"]*falling)}{<svg class="spark stale"$1}g;
my $icons = q{    <symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></symbol>
};
$post =~ s{(\s*</defs>)}{\n$icons$1} or die "no </defs>";
my $toggle = q{<button class="icon-btn" id="themeToggle" type="button" aria-label="Switch to dark mode"><svg class="i theme-moon" aria-hidden="true"><use href="#i-moon"/></svg><svg class="i theme-sun" aria-hidden="true"><use href="#i-sun"/></svg></button>
    };
$post =~ s{(<button class="icon-btn" type="button" aria-label="Notifications, 4 unread">)}{$toggle$1} or die "no bell button";
my $js = q{  var t=document.getElementById('themeToggle'),tk='portal.theme',root=document.documentElement;
  function theme(v){if(v){root.setAttribute('data-theme',v);}else{root.removeAttribute('data-theme');}var dark=v?v==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(t){t.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');}}
  var tq=/[?&]theme=(dark|light)/.exec(location.search);if(tq){theme(tq[1]);}else{try{theme(localStorage.getItem(tk)||'');}catch(e){theme('');}}
  if(t){t.addEventListener('click',function(){var dark=root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var v=dark?'light':'dark';theme(v);try{localStorage.setItem(tk,v);}catch(e){}});}
};
$post =~ s/^\}\)\(\);/$js})();/m or die "no script end";

open my $out, '>:raw', $file or die; print $out $pre . $css . $post; close $out;
printf "%s: whites %d, tints %d, shadows %d, pools %d, size %d\n", $file, scalar(keys %w), scalar(keys %k), scalar(keys %sh), scalar(@pools), length($pre.$css.$post);
