SITE MAINTENANCE TOOLS

Double-click a tool in this folder. Each one works on this project folder and
publishes to the GitHub repository it was cloned from (Git's "origin"), so the
tools keep working if the repository is renamed. Publishing tools wait for
GitHub to rebuild and check the website; keep their window open until they say
"Published" or explain what stopped them.

Requirements: Node.js 22 or newer, Git, GitHub CLI (signed in with
"gh auth login"), and Python 3 for the catalog tools.


CATALOG TEXTS AND METADATA

These two tools read and change the source folders in this project folder:
  original_texts - copy, translated_texts - copy, metadata - copy
Those folders are not stored in Git. If they are missing, copy them here from
your master copy first; both tools stop with an explanation if they are absent.

Edit-Catalog-Item.cmd
  Correct one item's metadata, original text or English translation.
  1. Enter the exact catalog ID (case-sensitive) and click Open item.
  2. Make the correction and click Save on this computer. The previous files
     are backed up under .qa\item-backups, with a manifest of what was saved.
  3. Click Publish saved item. Only this item is uploaded, starting from the
     latest published collection; other local edits are not included.
  If the corrected English text is used by reviewed subject quotations, the
  tool stops before uploading so those references can be reviewed first.
  Use Update-Collection.cmd to add, delete or rename items.

Update-Collection.cmd
  Publish the whole collection after replacing or adding source files. Keep
  exactly one CSV (with a PIN column) in "metadata - copy" and wait for Dropbox
  to finish syncing first. It packages the publishable sources, builds and
  tests a separate copy, uploads only the changed archive pieces, and waits for
  the website.


SUBJECTS: CONNECTIONS AND PASSAGES

These pages run on the live website and keep your work as drafts in that
browser until you export it. Use the same browser for a review session.

Review-Subject-Connections.cmd   Review and edit connections between subjects.
Review-Subject-Passages.cmd      Confirm or reject the passages quoted under
                                 each subject (the unresolved queue).
Open-Editorial-Workspace.cmd     The Subject view with editorial controls.

To publish your decisions:
  1. On Review subject connections or Review quoted passages, click
     Export decisions. This saves subject-edits.json (all published decisions
     plus your drafts) to your Downloads folder.
  2. Double-click Publish-Editorial-Decisions.cmd (or drag the exported file
     onto it). It checks the file, shows how many decisions are new or
     changed, and publishes after you type Y. Published decisions are never
     dropped, even if the export is older.
  Export regularly as a backup: clearing browser data removes drafts.


STUDY GUIDES

Edit-Study-Guide.cmd
  Change a guide's title, introduction, reading arc, the order of its readings
  and the note explaining each one's place, its discussion questions, the
  invitations under "Continue exploring", and its comparative readings.
  1. Type part of a title, choose the guide and click Open guide. Each reading
     shows its quotation, taken from the published website.
  2. Make the changes and click Save on this computer. The tool checks them
     against the website's rules (for example, the number of questions a guide
     may have, and that [1], [2] ... in the introduction match the comparative
     readings). The previous file is backed up under .qa\guide-backups.
  3. Save other guides if you like, then click Publish saved guides. All saved
     guides go up together and the tool waits for the website.
  The quotations a guide contains come from the subject's reviewed passages and
  are not changed here. New guides are still written with an assistant.

SUBJECT ORDER

Update-Subject-Order.cmd
  After editing "subjects - reference.docx" (the thematic subject order and
  its 19 headings), regenerate the order and publish both files.


VOLUME PDFs

Add or replace PDFs in "pdf_volumes - copy" and publish with Git (or the
GitHub website). The deployment copies changed PDFs to the separate PDF site
automatically; see "Volume PDF site" in README.md for its one-time setup.
