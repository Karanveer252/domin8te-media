#!/usr/bin/env bash
# Three-way merge of the builders' working copies into work/merged.
#   base    = work/base (the site as it was when the copies were made)
#   theirs  = work/sections, work/film, work/theme (each edited its own files/regions)
# Text files changed by more than one builder (index.html, site.js) are merged with git merge-file;
# files only one builder touched are copied. A conflict leaves markers in the merged file and is listed at the end.
set -u
W=/c/Work/domin8te-build/dash-integration/work
B=$W/base; M=$W/merged
mkdir -p "$M"
cp -r "$B"/. "$M"/
for c in sections film theme; do
  C=$W/$c
  (cd "$C" && find . -type f) | sed 's|^\./||' | while read -r f; do
    if [ ! -f "$B/$f" ]; then mkdir -p "$(dirname "$M/$f")"; cp "$C/$f" "$M/$f"; echo "new      [$c] $f"; continue; fi
    cmp -s "$B/$f" "$C/$f" && continue
    case "$f" in
      *.html|*.css|*.js|*.json|*.txt|*.xml|*.md|*.php|.htaccess)
        if git merge-file -L merged -L base -L "$c" "$M/$f" "$B/$f" "$C/$f"; then echo "merged   [$c] $f"
        else echo "CONFLICT [$c] $f"; fi
        ;;
      *) cp "$C/$f" "$M/$f"; echo "replaced [$c] $f (binary)";;
    esac
  done
done
echo "--- files with conflict markers:"
grep -rlE '^(<<<<<<<|>>>>>>>) ' "$M" --include=*.html --include=*.css --include=*.js 2>/dev/null || echo none
