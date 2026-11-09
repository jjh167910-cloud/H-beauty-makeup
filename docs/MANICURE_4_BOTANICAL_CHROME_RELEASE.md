# Additional ChatGPT-generated manicure photographs — four-photo release

Date: 29 October 2026. All four originals taken without image modifications from the 200-source H-Beauty review archive. User has confirmed ChatGPT origin. All four inspected at 1600 × 1600 native pixels against the actual H-Beauty catalog styles; SHA256 independently checked.

| Source ID | Destination stable style ID | Content |
|---|---|---|
| U030 | `nail-atlas-botanical-ruby` | Ruby red almond nails with thin hand-painted botanical leaves |
| U031 | `nail-atlas-botanical-espresso` | Espresso brown almond nails with fine botanical leaf linework |
| U072 | `nail-lavender-chrome` | Lavender mirror chrome on almond-shaped nails |
| U075 | `nail-silver-chrome` | Silver mirror chrome on square nails |

The work deliberately **does not** alter the existing nine v4 masters, the separately approved Midnight Sparkle photograph, or any of the 78 pedicure assets. All four files use immutable standalone `public/nails/photos/<style-id>.webp` paths.

The Vite production build fails closed if the four-file lock is missing, duplicated, incomplete, or checksum-mismatched. The finalizer checks all four again and offline-caches them. The gallery uses AI-inspiration labeling, never claiming work by salon staff.

Editorial caveat: the four chosen files have distinguishable styles and five nails visible, including thumbs partially foreshortened or seen from the side. Complete visual certification for all device crops and user acceptance remains a separate check.

Release target after CI and live verification: **14 approved manicure photographs + 78 pedicure photographs**, with illustrated fallbacks for the remaining 206 manicure designs.
