# H-Beauty recovered original photo albums — no generation

Two previously uploaded source ZIPs were recovered from the user's earlier chats, preserving every original byte:

- `H-BEAUTY-98-Bible-Complete-98-young-lady-hand-pure-silk.zip`: 98 entries, **38 distinct image hashes** and 60 repeat assignments.
- `H-BEAUTY-98-BIBLE-COMPLETE-PURE-IVORY-SILK.zip`: 98 entries, **32 distinct image hashes** and 66 repeat assignments.

There are **70 byte-distinct photographs** across these two albums. None of their hashes overlaps the previous archive containing 200 distinct original WebPs. Being distinct does not mean accurate, anatomically sound, or approved for publication. Several old filenames plainly misidentify the actual photo subject or nail style; some files are feet.

## Exact photo-to-catalog reconciliation

| Existing ZIP | Original filename (unaltered source bytes) | Verified visual design | Catalog style ID | SHA-256 | Decision |
|---|---|---|---|---|---|
| Pure Ivory Silk 98 | `sculpture-blush.webp` | Merlot oval nails with asymmetrical gold leaf, five fingers on ivory silk | `nail-atlas-foil-merlot` | `64a9d73ccd7dc60a7f4e7f840f0d49513010de8ab01620f01f6a3e004d91e884` | Included in this release |
| Pure Ivory Silk 98 | `velvet-midnight.webp` | Cobalt-blue prism chrome with bright linear reflections | `nail-atlas-prism-cobalt` | `8d35f3dd81f462bc30de4771b7ace45d7db2ef5b8193e444aa4631aac0a9ddaa` | Shortlisted; **not** part of this release |
| Young Lady 98 | `minimal-ivory-young-lady-hand-pure-silk.webp` | Ruby-red metallic magnetic cat-eye beam | `nail-atlas-magnetic-ruby` | `90ceb50ebeaa8bc09c0359259d014ccdce622256c5667da8fe8449caac11fc2e` | Shortlisted; **not** part of this release |
| Young Lady 98 | `gradient-midnight-young-lady-hand-pure-silk.webp` | Midnight-to-ivory smoky gradient | `nail-atlas-gradient-midnight` | `045f19574eed07ce025052cca624a243b4462b0ae442c85ccb6faf11e91248f7` | Shortlisted; **not** part of this release |
| Pure Ivory Silk 98 | `minimal-merlot.webp` | Long lilac coffin nails with recognizable galaxy stars and glitter | `nail-atlas-celestial-lavender` | `aa824991583021d03c0066353772f4b1ca1190cf7383ae33eefa9357926b5cc1` | Shortlisted; **not** part of this release |

**Do not trust source names:** all five selected visual designs differ from the original filenames. Actual visual inspection is necessary. No new images were generated, and no photo was recolored, enlarged, inpainted or recompressed.

The one-image release follows the previously merged full-resolution editorial approval gate and cannot be considered live until all PR CI and Cloudflare acceptance tests pass. All existing verified 58 manicures and 78 pedicures are preserved. The other 161 unapproved catalog styles keep their original illustrations.
