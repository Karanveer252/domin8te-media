#!/usr/bin/perl
# Aligns tokens.json dark values with the round-2 dark palette (warm espresso). Light values untouched.
use strict; use warnings; local $/;
my $f = shift or die "usage: tokens-dark.pl <tokens.json>\n";
open my $fh, '<:raw', $f or die; my $t = <$fh>; close $fh;
my %dark = (
  'ground' => '#171411', 'surface' => '#26211c', 'surface-2' => '#2e2822',
  'hairline' => '#2e2b29', 'hairline-strong' => '#454341',
  'ink' => '#f3eee6', 'ink-2' => '#c4bbaf', 'ink-3' => '#a39a8e',
  'accent-ink' => '#ffa37e', 'accent-tint' => '#3c2d25', 'focus' => '#f3eee6',
  'status-needs-tint' => '#3c2d25', 'status-progress-tint' => '#2a2e35', 'status-scheduled-tint' => '#302e2d',
  'status-done-tint' => '#2a3327', 'status-paused-tint' => '#2c2a27', 'status-delayed-tint' => '#3a301f',
);
my $n = 0;
for my $name (sort keys %dark) {
  my $v = $dark{$name};
  $n += $t =~ s/("name": "\Q$name\E", "value": \{ "light": "[^"]*", "dark": )"[^"]*"/$1"$v"/;
}
die "only $n of " . scalar(keys %dark) . " tokens updated\n" unless $n == scalar(keys %dark);
open my $out, '>:raw', $f or die; print $out $t; close $out;
print "$f: $n dark values aligned\n";
