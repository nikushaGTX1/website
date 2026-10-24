# Saved AI Match card artwork

The client cards use local WebP images. No website image generator or API key is
required. The finished-scene catalogue lives in `public/images/ai-match/portraits`.
Open `catalogue.html` there to review the images by household layout.

The preset matrix has 144 entries: nine household layouts × sixteen pet variants.
The layouts are man, woman, couple, two adults with one five-year-old, two adults
with children aged nine and sixteen, two roommates, three roommates, three adult
relatives, and four professional colleagues. Pet variants cover all subsets of dog,
cat and rabbit, with small/medium/large dog versions. Every selected animal appears
once; “Other” is specifically a rabbit.

This is a preset catalogue, not every possible questionnaire answer. Different
child ages/counts, larger groups, repeated pets, custom animal species and
lifestyle-specific outfits need additional finished portraits. The matcher keeps
the existing character illustration for profiles outside the preset matrix rather
than assigning an image with the wrong people or animals.

`catalogue.json` records the individual generation prompts and scene metadata.
`coverage.json` records saved and missing files. `npm run build` updates the local
asset index and coverage report before compiling Angular. No generation request
runs during a build or a website visit.

`node scripts/portrait-contact-sheets.mjs` makes contact sheets in `output/ai-match`.
`npm run test:unit` verifies that every preset has a real file, selects the correct
image regardless of pet-selection order, and rejects unsupported combinations.
