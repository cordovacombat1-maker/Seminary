# Manually downloaded library texts

The library script downloads most books automatically. If a download fails (or for Keil & Delitzsch
and Lightfoot, which have no reliable automatic source), you can download the plain-text (.txt) file
yourself and save it here, named after the volume id — for example:

    scripts/library-texts/keil-delitzsch.txt
    scripts/library-texts/lightfoot-epistles.txt
    scripts/library-texts/calvin-institutes.txt

Run `npm run ingest:library -- --list` to see every volume id. Only use public-domain editions
(published before 1929). Files placed here are not committed to GitHub.
