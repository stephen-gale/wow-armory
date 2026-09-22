#!/usr/bin/env python3
"""
patch-wowbackup.py

Replaces the "Saving characters.json..." block in your real, live
wowbackup.sh with the current version from this repo's reference/wowbackup.sh
- no manual find-and-replace, no hunting for what changed. Run this once
per Collections rebuild (this script always pulls the replacement from
reference/wowbackup.sh next to it, so a `git pull` in this repo before
running it is enough to pick up any future change too).

Usage:
  python3 patch-wowbackup.py <path-to-your-live-wowbackup.sh>

Edits the file in place (after writing a `.bak` backup alongside it).
Aborts with no changes if either file's start/end markers can't be found,
so an already-hand-edited or unexpected file fails loudly instead of
silently mangling something.
"""
import sys
import os

START_MARKER = 'echo "  Saving characters.json..."'
END_MARKER = ') || echo "  Warning: failed to publish characters.json to GitHub (non-fatal)"'


def extract_block(lines, label):
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == START_MARKER)
    except StopIteration:
        sys.exit(f"Aborting: start marker not found in {label}:\n  {START_MARKER!r}")
    try:
        end = next(i for i in range(start, len(lines)) if lines[i].strip() == END_MARKER)
    except StopIteration:
        sys.exit(f"Aborting: end marker not found (after the start marker) in {label}:\n  {END_MARKER!r}")
    return start, end


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    live_path = sys.argv[1]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    reference_path = os.path.join(script_dir, "..", "reference", "wowbackup.sh")

    with open(live_path) as f:
        live_lines = f.read().splitlines(keepends=True)
    with open(reference_path) as f:
        reference_lines = f.read().splitlines(keepends=True)

    live_start, live_end = extract_block(live_lines, live_path)
    ref_start, ref_end = extract_block(reference_lines, reference_path)

    new_block = reference_lines[ref_start:ref_end + 1]
    if live_lines[live_start:live_end + 1] == new_block:
        print(f"{live_path} already matches reference/wowbackup.sh - nothing to do.")
        return

    backup_path = live_path + ".bak"
    with open(backup_path, "w") as f:
        f.writelines(live_lines)

    new_live_lines = live_lines[:live_start] + new_block + live_lines[live_end + 1:]
    with open(live_path, "w") as f:
        f.writelines(new_live_lines)

    print(f"Patched {live_path} (backup saved to {backup_path}).")
    print(f"Replaced {live_end - live_start + 1} lines with {len(new_block)} lines.")


if __name__ == "__main__":
    main()
