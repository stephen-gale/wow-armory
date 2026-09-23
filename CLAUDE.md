# Working process for this repo

Two rules, added after the Titles feature needed two build passes instead of
one — the first pass invented a bespoke one-off treatment instead of
checking what already existed, and skipped researching the real mechanism
before writing code.

## 1. Reuse established patterns first

Before designing a new feature, check how the closest existing thing in
this app already works, and default to matching it — don't invent a new
shape unless there's a real reason this one is different.

Concretely, before adding anything roster/character-panel-shaped, check:
- Is this a **Collections category**? (Sets, Mounts, Companions,
  Legendaries, Tabards, Heirlooms, Titles) — same shape every time:
  `assets/data/collections/<key>.json` reference data, registered in
  `COLLECTION_CATEGORIES` (app.js) and `CATEGORIES` (export scripts),
  sticky (never removed, `earned_at` preserved), one flat list sorted
  alphabetically, same detection/storage split (detect + store server-side
  in the export scripts, resolve names/render client-side in app.js).
- Is this a **standalone module** instead? (Equipped, PvP) — independent
  of the Sort by Type/Date toggle, no `earned_at`, own header, shown only
  when it has content.
- Does this project already have a house style for the underlying
  problem — mechanical detection over hand-curated lists, real dates
  preferred over guessed ones, graceful degradation over a hard failure,
  a documented narrow exception (like `TRAINER_TAUGHT_MOUNTS`, Blood
  Parrot) instead of silently widening scope?

If the answer is "this is basically a Collections category," build it as
one from the start — don't ship a narrower one-off and rebuild it into the
real pattern after the fact.

## 2. Research before building

For anything that isn't a mechanical, already-verified extension of
existing code (a new data source, a new detection mechanism, a claim
about how the game or the server behaves), confirm it against a primary
source before writing the implementation — not after being asked to
check. In this project that has meant: cloning AzerothCore's own source
to confirm exact schema/bit-encoding rather than assuming, checking a
real CSV's actual columns before designing around them, verifying an icon
against the actual client data rather than a plausible guess.

Cheap ways to skip this that don't actually skip it: pattern-matching
from memory of "how WoW usually works," reusing a shape that merely looks
plausible, or shipping a narrower version now and expanding later hoping
it'll all fit — expanding later is exactly what cost the extra build pass
on Titles.

If a genuinely primary source isn't reachable and a design decision is
being made without one, say so explicitly rather than presenting a guess
as verified.
