SITE MAINTENANCE TOOLS

Double-click a tool in this folder. Each one works on this project folder and
the GitHub repository it was cloned from (Git's "origin"), so the tools keep
working if the repository is renamed.

No tool changes the website directly. A tool that publishes something puts the
change on a new branch and opens a pull request on GitHub, with a description
of what changed, and prints its link. Review and merge the pull request on
GitHub; the website then rebuilds and checks itself. Closing a pull request
without merging discards the proposal. This keeps a record of every change.
Keep the tool's window open until it prints the pull request link or explains
what stopped it.

The files a tool proposed stay changed in this folder until the pull request
is merged; the next tool run notices that GitHub has them and tidies up. If a
tool says GitHub has newer versions of files changed here, merge (or close)
the earlier pull request first.

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
  3. Click Open pull request for saved item. Only this item is included,
     starting from the latest published collection; other local edits are
     not. The tool prints the pull request's link. Review and merge it on
     GitHub; the website then rebuilds by itself.
  If the corrected English text is used by reviewed subject quotations, the
  tool stops before opening a pull request so those references can be
  reviewed first.

  To delete an item entirely, enter its ID and click Preview deletion (at
  the end of the page). It lists the subject quotations taken from the item
  and the study-guide readings that will be removed with it; the volume PDFs
  are not changed. Type the ID again and click Delete and open pull request.
  The tool rebuilds and tests the whole collection on this computer (allow
  half an hour or more), then opens the deletion as a pull request; merge it
  on GitHub to publish. Once the pull request is open, the item is removed
  from the source folders here, with a backup under .qa\item-backups. If you
  close the pull request without merging, copy the files back from that
  backup (its manifest.json names them).
  Use Update-Collection.cmd to add or rename items.

Update-Collection.cmd
  Propose the whole collection after replacing or adding source files. Keep
  exactly one CSV (with a PIN column) in "metadata - copy" and wait for Dropbox
  to finish syncing first. It packages the publishable sources, builds and
  tests a separate copy, and opens a pull request with only the changed archive
  pieces and volume PDFs. The description lists, by catalog ID, the texts and
  metadata rows that were added, changed or removed.


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
     changed, and opens a pull request after you type Y. Published decisions
     are never dropped, even if the export is older.
  3. Merge the pull request on GitHub to publish the decisions.
  Export regularly as a backup: clearing browser data removes drafts.


STUDY GUIDES

Edit-Study-Guide.cmd
  Change a guide's title, introduction, reading arc, the order of its readings
  and the note explaining each one's place, which sentences of each reading
  are shown, which readings are left out, its discussion questions, the
  invitations under "Continue exploring", and its comparative readings.
  1. Type part of a title, choose the guide and click Open guide. Each reading
     shows its quotation, taken from the published website.
  2. Make the changes and click Save on this computer. The tool checks them
     against the website's rules (for example, the number of questions a guide
     may have, and that [1], [2] ... in the introduction match the comparative
     readings). The previous file is backed up under .qa\guide-backups.
  3. Save other guides if you like, then click Propose saved guides. All
     saved guides go into one pull request, whose description says what
     changed in each guide. Merge it on GitHub to publish.
  Under each reading, "Choose sentences" lists the whole passage: tick the
  sentences to show (the wording itself never changes). "Leave out" keeps a
  reading out of the published guide; it stays listed in the editor so it can
  be put back. A reading with an authorized translation keeps at least one
  authorized sentence and cannot be left out. These checks need the published
  website (or a local build) to read the source text.
  The quotations a guide can contain come from the subject's reviewed passages
  and are not added here. New guides are still written with an assistant.

SUBJECT ORDER

Update-Subject-Order.cmd
  After editing "subjects - reference.docx" (the thematic subject order and
  its 19 headings), regenerate the order and open a pull request with both
  files. The description lists subjects and headings that moved.


VOLUME PDFs

Add or replace PDFs in "pdf_volumes - copy" and run Update-Collection.cmd,
which includes them in its pull request (or propose them with Git or the
GitHub website). After merging, the deployment copies changed PDFs to the
separate PDF site automatically; see "Volume PDF site" in README.md for its
one-time setup.
