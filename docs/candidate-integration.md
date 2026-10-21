# Reviewed quotation additions

The reviewed GPT proposals are ordinary editorial selections in
`data/subject-extracts-public.json.gz`, with their exact source versions and
ranges in `data/extract-review-decisions.json`. The review facility and its
candidate files are not build inputs.

- 733 quotations added to 626 subject compilations.
- 706 added to study guides, including 53 replacements in capped guides.
- 27 retained in the full compilations but not chosen for capped guides.
- Every existing compilation quotation remains; guides retain the 300-selection
  limit and mandatory authorized wording.
- Ten new answers also display the adjacent question from the same exact source.
  The approved answer boundaries remain unchanged.

The guide configurations, selection reviews and catalogue fingerprints describe
the integrated selections. Build and verify them with the standard commands:

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
```

The branch retains the later deletion of the Night of Power subject and the
current site's navigation, graph and study-guide interface changes.

## Displayed spelling

The site displays `Abdu'l-Baha` in place of the transcription error
`Abduil-Baha` (including its accented final vowel). Original source files,
stored plain text, source hashes, quotation ranges, URLs and editable fields
remain unchanged. The replacement has the same UTF-16 length, so existing
highlights keep their offsets.

Newly rendered source HTML and static study guides apply the correction during
rendering. A small shared display module also covers cached records, search
snippets, graph labels and text inserted by the on-demand readers. It edits text
nodes, never HTML attributes or link destinations.
