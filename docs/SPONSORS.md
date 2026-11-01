# Sponsor slots

Every brand in the game is an original stand-in. Each one sits where a real sponsor's name could go once a
deal exists. This page lists the slots, the kinds of business that would plausibly pay for each, and where
the art lives so a real name and logo can be swapped in. Until something is signed, keep the stand-ins: no
real names, logos, pack colours or slogans.

Company ownership changes. Check who owns each brand before approaching anyone.

## The biscuit stand (Chinook biscuit run)

Six pegs, one biscuit kind each. Every peg has a printed card on the plinth with the brand, the biscuit and
a short line. The biscuit's face carries an embossed generic name ("DIGESTIVE", "RICH TEA").

| Slot | In-game stand-in | Plays like | Sponsors to approach |
|---|---|---|---|
| Wheatmeal digestive | Hartwell's | Steady. The first piece goes after about 3 s in the tea. | McVitie's (pladis) for the original digestive. Fox's. Supermarket own brands (Tesco, Sainsbury's, Asda, Aldi, Lidl, Co-op, M&S). |
| Rich tea | Corner Shop | Fragile. It goes after about 1.4 s, which makes it the hard mode. | Supermarket own brands, which the "Corner Shop" name already points at. McVitie's and Crawford's (pladis) also make rich tea. |
| Ginger nut | Brackley | Tough. It survives about 10 s, which makes it the easy mode. | McVitie's Ginger Nuts. Border Biscuits. Arnott's Ginger Nut in Australia and New Zealand. Fox's. |
| Oat crunch | Fellside | Sturdy, but it sheds a lot of crumbs. | McVitie's Hobnobs. Nairn's. Doves Farm. Any oat-heavy or "better for you" biscuit brand. |
| Shortbread finger | Highfold | Buttery and weak when wet, with lots of crumbs. | Walkers Shortbread. Dean's of Huntly. A Scottish heritage baker. |
| Chocolate cream finger | Wattle & Co. | The straw (Tim Tam Slam). Snap off both ends, dip one end, and it draws tea, then collapses a few seconds later. | Arnott's (Tim Tam) is the obvious first call, because the slam is their biscuit's ritual. Alternatives: pladis (Penguin) and Jacob's (Club). If Arnott's signs, the in-game name could become the real one and the card could say "Tim Tam Slam". |

The stand's brass plaque reads "Biscuits". A single-sponsor deal could take the plaque (for example, the
whole stand as one maker's range) and leave the six cards to that maker's products.

## Other slots in the world

These already exist and could carry a partner. None of them has a stand-in brand yet.

| Slot | Where | Sponsors to approach |
|---|---|---|
| Tea bag tags | Printed on both sides of every bag's tag | Tea brands: Yorkshire Tea (Taylors of Harrogate), PG tips, Tetley (Tata Consumer Products), Twinings, Typhoo, Clipper. |
| Tea stand plaques | The brass plaque on each tea stand ("Tea Bags") | The same tea brands. A plaque could carry the brand whose bags hang there. |
| Milk bucket and crock | The orange bucket's fabric band ("MILK") and the stoneware crock | Dairies: Arla (Cravendale), Müller, a regional dairy, or an oat milk brand such as Oatly. |
| Chinook livery | The Chinook's sides (olive drab, original stencils only today) | A biscuit maker that takes the whole stand, a delivery or logistics company (the biscuit run is a delivery job), or a supermarket's delivery service. |
| Skycrane livery | Orange with a green stripe | A dairy, matching the milk tanker job. |

## Swapping in a real sponsor

- Brand name and card text: `KINDS[].brand` and `name` in `src/sim/biscuits.js`, and the card layout and
  colour (`BRAND_COLORS`) in `cardsMesh()` in `src/render/biscuitView.js`. To use a logo, draw the
  licensed image into that card's cell of the canvas before the text.
- Biscuit faces: `faceTexture()` in `src/render/biscuitView.js` draws each kind's pattern and embossing. A
  sponsor's real biscuit design (its docking pattern or stamped name) goes there, with permission.
- Feel: each kind's `soak`, `strength`, `absorb` and `shed` in `src/sim/biscuits.js` set how it behaves in
  the tea. If a sponsor's real biscuit is sturdier or softer than the stand-in, retune it to match and
  rerun `node tests/biscuit-checks.mjs`, which checks the crumble order.
- Keep markings plain and diegetic: a printed card, a plaque or a stamp on the biscuit. Don't add banners or
  pop-ups.
