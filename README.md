# Block A Notes

A small study group's site for learning the Master's courses together: from the lecturers' material,
what was said in class, and our own checked research. It started as the exam room for Digital
Developments (LDD, Block A); that course is now the first course pack.

Tabs:

- **Study** (opt-in per device: it appears once a device opens `#/study`, and is then home): each
  class as a story, its topics in plain words with a hotel example and the usual mix-up, open
  questions to explain in your own words, framework flashcards and a check with the drill.
- **Practise**: the lecturer's trial exam, three mock exams in the same format and a multiple-choice
  drill by class. Open answers can be shared with the group.
- **Topics**: every concept from the questions, browsable by class and searchable.
- **Slides**: the class decks and the course book in a viewer, searchable, with the questions that
  practise each slide.
- **Notes**: each person opens their own page with a name and a PIN, writes notes and attaches files;
  the whole group can read every page.

## Files

- `index.html` is the page and its styles, served by GitHub Pages. `notes.js` runs the Notes tab and
  starts the app; `practise.js` runs Practise, Topics and Slides, with an address per view so the
  browser's Back button works; `study.js` runs Study.
- `memory.js` keeps what each person knows, item by item, with the FSRS-4.5 schedule (the open
  scheduler Anki uses), and a count of reviews per day. It lives on the device and, once you have
  opened your page on the Notes tab, in your page's private progress, so phone and laptop share it.
- `packs/<course>.enc` are the course packs: every topic, framework and question of a course, each
  with where it comes from and how it was checked (every quote re-checked against its source on each
  build). Compressed, then encrypted with the group code (PBKDF2 → AES-GCM).
- `content.enc` holds the practice exams and the drill; `slides/` the decks and the book. Both are
  encrypted the same way.
- `supabase/schema.sql` is the notes database. Its tables are locked behind row level security, its
  functions check the group code, and its file bucket only accepts uploads into an existing page's
  folder. `supabase/exam-room.sql` adds shared answers; `supabase/learning.sql` adds each person's
  private learning progress.

The plain content and the scripts that build and check it are kept outside this repository, and so is
the group code. Without the invitation link the page opens to a notice and reads nothing.
