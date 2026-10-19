# PM & Scrum Fundamentals

An interactive course in Product Management and Scrum fundamentals, written for a new APM on a B2B wealth-tech AI platform. It is a single file (`index.html`) with no build step and no dependencies apart from optional Google Fonts.

## Open it

Download `index.html` and double-click it, or open it in any modern browser. Progress is saved in your browser's localStorage. If storage is blocked, the course still works, but progress lasts only for the session.

## Live site

Deployed with GitHub Pages: https://lalwalataukir.github.io/pm-fundamentals/

Every push to the default branch runs `.github/workflows/pages.yml`. It deploys `index.html`, then runs the end-to-end browser tests in `tests/live-qa.js` against the live URL. To run the same tests locally, use `node tests/live-qa.js` (it needs `playwright`).

## What's inside

- **Track 1 · PM Fundamentals (13 lessons):** role, users and problems, discovery, prioritization, specs, metrics, working with engineering and design, stakeholders, roadmaps, launches, building AI products, product analytics & experimentation, product strategy & B2B business models
- **Track 2 · Scrum Fundamentals (7 lessons):** follows the Scrum Guide (November 2020) and separates what the Guide says from common practice
- **Track 3 · Senior PM Playbook (4 lessons):** senior PM judgment and decisions, B2B go-to-market and the customer lifecycle, product sense and craft, product leadership and scaling teams
- **Every lesson:** the idea in one line, an explanation, a worked example, common mistakes, a Try-it exercise with a model answer, and a quiz with an explanation for every option
- **Search:** one search bar (press `/` or Ctrl/Cmd + K) across every lesson, glossary term, simulator step and the cheat sheet, with matches highlighted on the page
- **Tools:** a Sprint simulator (8 decisions), flashcards (114 cards), a searchable glossary (159 terms), and a cheat sheet that prints on one A4 page
- **Design:** the Agent Field Guides design system in [`design-system/`](design-system/README.md): its colour tokens, Bricolage Grotesque, Atkinson Hyperlegible and IBM Plex Mono, and its component rules. Dark is the default; the theme button in the sidebar switches to light, and the choice is shared with the Agent Field Guides
