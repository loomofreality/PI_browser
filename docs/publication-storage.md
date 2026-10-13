# Public hosting and retained audit records

Build and validate the complete collection in `dist/` as before. Then run:

```text
node scripts/prepare-pages.mjs COMMIT_SHA
node --test tests/*.test.mjs
```

The preparation step writes `public-site/`, the only directory uploaded to this repository's GitHub Pages site, and `pdf-site/`, the volume PDFs for the separate PDF site (see README, “Volume PDF site”). Excluded PDFs are listed with the reason “hosted on PDF site”, and `summary.json` records the PDF site's file count, bytes and manifest hash. It copies every current reading asset unchanged, checks each copy byte-for-byte, and records SHA-256 hashes. The only stylesheet change points study guides at the identical existing main-site fonts. It refuses missing audit exports, unequal font copies, unpackaged guide exports, and a site at or above 1,000,000,000 bytes. The final size test measures the staged site and rejects a staging folder from a different dataset.

The full build remains intact. `dist/build-state.json` stays in the generated-data cache, but is excluded from hosting. The compiled verification archive, validation report and both sentence-review formats are copied exactly to `publication-audit/COMMIT_SHA/DATASET/`. Duplicate guide fonts are excluded only after equality with the main-site files is verified; font licences remain at their existing main-site paths. No quotations, source records, search shards, PDFs, reader links, or editorial material are removed.

GitHub Actions uploads the audit directory as `publication-audit-COMMIT_SHA`, separately from the Pages artifact, with 90-day retention. Before it expires, download it to a durable local folder such as `reports/hosting-cleanup/COMMIT_SHA/`. Do not add the generated audit archive to Git history or to the public site. The audit directory includes:

- Exact compiled and review exports under `study-guides/`.
- `summary.json`: final public bytes, savings, excluded files and commit/dataset identity.
- `files.json.gz`: every published path, byte length and SHA-256, including all reading assets.

To check the deployed site against its own downloaded audit package:

```text
node scripts/verify-publication.mjs https://portlandiator.github.io/PI_browser/ AUDIT_DIRECTORY REPORT.json
```

This verifies every study-guide page and compressed payload, the shared fonts, interface files, representative corpus records and search shards, PDF availability/length, and absence of the excluded public files. The manifest is checked against the public commit marker first so an older CDN generation cannot pass. Full source/content checks and the complete test suite still run before deployment. Browser checks cover desktop/mobile catalogue and study-guide readers, keyboard interaction, printing readiness and a volume PDF.

For a local preview set `PI_SERVE_PUBLIC=1` and run `node scripts/serve.mjs` (optional `PORT` override). Keep local study-guide editorial work using `dist/`; use the separate audit for live verification instead of fetching the removed public `compiled.archive.json.br` URL. Compare its decoded subjects with the reviewed local compiled subjects when publishing study-guide work.
