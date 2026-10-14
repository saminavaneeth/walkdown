# Walkdown

A safety professional describes what they saw on a floor walk the way they would tell a colleague: by voice, photo, short video, a photo of a permit, or typed notes. Walkdown turns that one capture into a plan of linked records across the systems a site already uses (EHS, maintenance, permit to work, training, alerts). It checks every value and sends nothing until a person approves it.

**Try it:** [public demo](https://saminavaneeth.github.io/walkdown/) (recorded scenarios, no account needed)

**Live AI:** the same page runs inside Claude, where Claude reads your own notes, photos and video frames on your own Claude account. The link is private to the owner until it is shared.

This is an independent concept prototype. It is not affiliated with any EHS software vendor, and all names, companies and events are fictional. The five connected systems are mocks that run in the browser.

## What it shows

1. **Capture**: notes (typed or dictated with the phone keyboard), photos, video (sampled into frames) and document photos.
2. **Plan**: the AI splits the capture into events and proposes steps in each system, with links between them. For example, a corrective action points at its work order, and a contractor observation points at its permit check.
3. **Checks** run in the app on every plan, independent of the AI:
   - every value must quote the capture, or it is removed;
   - pick-list and location validation;
   - names and numbers must appear in their own quote;
   - severity, recordability, regulator reporting and priority are left for a person;
   - no worker names on behavior observations or training assignments;
   - health details only in restricted fields;
   - judging wording is flagged;
   - a keyword backstop for serious-injury precursors;
   - a raw-text scan that adds an immediate alert for words like "ambulance" or "hospital", even if the AI missed it;
   - sentences that reached no step are underlined.
4. **Review**: answer follow-up questions, fix values, approve or skip each step. An immediate alert can be sent first.
5. **Send**: steps go out in dependency order. New IDs are written into the records that link to them. Offline systems queue and retry, invalid values are rejected (422), sends are idempotent, and everything lands in an activity log.
6. **Test the checks**: one button adds four deliberate AI mistakes to the plan so you can watch the checks catch them.

## Layout

```
src/app.html     page template: styles and markup
src/data.js      site, mock systems, permits, demo scenarios with recorded AI results
src/engine.js    checks, ordering, prompt, mock connectors (pure functions, no DOM)
src/ui.js        the app
tests/engine.test.js
build.js         writes docs/index.html (GitHub Pages) and dist/walkdown-artifact.html (Claude artifact)
```

## Build and test

```
node tests/engine.test.js
node build.js
```

GitHub Pages serves `docs/` from the `main` branch.

## Feedback

Use the Feedback button in the app, or [open an issue](https://github.com/saminavaneeth/walkdown/issues/new).
