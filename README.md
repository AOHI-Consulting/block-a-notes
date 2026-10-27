# Block A Notes

A small study group's site with three tabs.

- **Practise**: practice for the Digital Developments (LDD) exam. It has the lecturer's trial exam, three mock exams in the same format and a multiple-choice drill by class. Section A answers are checked as you go, or at the end in exam mode with a 3-hour timer. For the open questions you tick a marking guide to score yourself, and you can share an answer with the group.
- **Topics**: every concept from the questions, browsable by class and searchable across questions, explanations and marking guides, with a link straight to each question.
- **Notes**: each person opens their own page with a name and a PIN, writes notes and attaches files, and the whole group can read every page.

Files:

- `index.html` is the page and its styles, served by GitHub Pages. `notes.js` runs the Notes tab and starts the app; `practise.js` runs Practise and Topics, with an address per view (`#/practise/mock-c/a/3`) so the browser's Back button works.
- `content.enc` holds the practice questions, encrypted (PBKDF2 → AES-GCM) with the group code from the invitation link. The page decrypts them in the browser. The plain questions and the build script are kept outside this repository.
- `supabase/schema.sql` is the notes database. Its tables are locked behind row level security, its functions check the group code, and its file bucket only accepts uploads into an existing page's folder.
- `supabase/exam-room.sql` adds the shared answers for the Practise tab, behind the same group code and page token.

The group code is not in this repository. Without the invitation link the page opens to a notice and reads nothing.
