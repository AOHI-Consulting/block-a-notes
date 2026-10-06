# Block A Notes

A shared notebook for a small study group: each person opens their own page with a name and a PIN, writes notes and attaches files, and everyone in the group can read every page.

- `index.html` is the whole site, served by GitHub Pages.
- `supabase/schema.sql` is the database: tables locked behind row level security, functions that check the group code from the invitation link, and a file bucket that only accepts uploads into an existing page's folder.

The group code is not in this repository. Without the invitation link the page opens to a notice and reads nothing.
