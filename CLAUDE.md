# Claude working notes: Partial Inventory browser

Read AGENTS.md first; it holds the project invariants. Then read DESIGN.md before interface work, SKILL.md before corpus/reader/search work, SUBJECTS.md before Subject view or editorial tools, and THEMATIC-MATRIX.md (if present locally) only for the offline scoring pilot. README.md is the user-facing overview.

## Which document wins
- Code and tests are ground truth for current behaviour. When guidance disagrees with them, confirm with the owner before changing code, then correct the guidance.
- DESIGN.md is the authoritative interface specification. Later paragraphs in DESIGN.md refine earlier ones (for example, the curated 18-field filter rail at its end).
- The "Enhanced catalogue metadata" paragraph is duplicated in AGENTS.md, README.md and SKILL.md. Keep those three copies identical; DESIGN.md has its own version, which must agree with them.

## Facts verified against the code (2026-09-23)
- Subject directory defaults to Thematic order; only `order=alphabetical` switches (src/subjects.mjs).
- Subject colours: CSV hex values map to theme-aware day/night shades in src/theme.css via src/subject-colors.mjs.
- Catalogue details omit Subjects and Citation count and place Extract after Word count (src/translation-status.mjs `catalogueDetails`).
- The filter rail is the curated list in src/catalog-filters.mjs; there are no availability filters.
- The public subject graph has no zoom controls or duplicate related-subject list.

## Facts verified against the code (2026-10-12)
- The site has 659 subjects, one per CSV row (the two "serving humanity" punctuation variants are merged; "Night of Power" was deleted on 2026-10-18).
- `data/collection/` holds the source archive as 33 uncompressed tar shards; `scripts/archive-sources.py` writes only shards whose bytes change.
- Volume PDFs are published to the separate site in `src/pdf-hosting.json` by `scripts/publish-pdf-site.mjs` (needs the `PDF_SITE_TOKEN` secret).
- Windows-1252 fallback decoding goes through `scripts/source-encoding.mjs`, never `TextDecoder('windows-1252')`.
- Subject passages for the Catalog reader are grouped per source in `subjects/passages/<record filename>`.
- Repository and site URLs in the update and item-publishing tools come from the `origin` remote.
- User-facing tools are launchers in `maintenance/`; their logic lives in `scripts/` (`run-node-tool.ps1`, `publish-changes.mjs`, `publish-editorial-decisions.mjs`, `open-site-page.mjs`, `update-subject-order.ps1`).
- `maintenance/Edit-Study-Guide.cmd` runs `scripts/edit-study-guide-server.mjs`: a local page that edits a guide's wording and reading order in `study-guides/*.json` (checks in `study-guide-store.mjs` mirror `build-compilation-pilot.mjs`; quotation previews come from the published site via `study-guide-quotations.mjs`). It never changes `selection`, `slug`, `id` or neighbor evidence.
- An order entry may carry `shortened` (verbatim whole-sentence spans, checked by `scripts/study-guide-shortening.mjs`) and `omitted: true` (left out of the published guide but still covered; never allowed for authorized wording). The editor's sentence picker and its save checks use `scripts/study-guide-passage.mjs`, which mirrors the build. Question limits count only the readings shown.
- `study-guides/` is not part of the deployment cache key: `deployment-cache.mjs refresh` rebuilds the guides on every deployment, so guide-only pushes reuse the cached collection.
- Volume view loads PDF.js after `src/map-polyfill.mjs` and uses `src/pdf-worker.mjs` as the worker entry; without them PDF.js 6 fails to render in browsers lacking `getOrInsertComputed`/`Math.sumPrecise`.

## Working environment
- The owner works on Windows in a Dropbox folder under `C:\Users\steve\Dropbox\AI_project\` (the working folder is named for the task). Claude may reach it only through file staging, not a shell, so builds and tests run in Claude's own workspace on a copy, and the owner publishes with the launchers in `maintenance/` (see `maintenance/README.txt`) or a normal Git push.
- Several docs use CRLF line endings. Preserve each file's existing line endings and UTF-8 encoding; watch for mojibake (`â€™`, `â†’`) when editing.
- Do not edit the immutable source folders (`original_texts - copy`, `translated_texts - copy`, `metadata - copy`, `pdf_volumes - copy`). Root `*.log` files and `.qa/` are ignored working output.
- The owner's local folder can hold uncommitted work that is not on GitHub (as of 2026-09-23: the passage review utility, passage citations and thematic-matrix scripts). Never publish it without the owner's explicit approval; compare against `origin/main` before pushing.
- Earlier development was done with ChatGPT/Codex; references to "Codex" as maintainer in the docs mean whichever assistant is maintaining the project.
- Never force-push, change repository visibility, or upload an unfiltered source archive (`python scripts/archive-sources.py --check`).
