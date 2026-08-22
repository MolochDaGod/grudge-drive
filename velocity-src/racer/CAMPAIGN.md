# Velocity campaign — Roll em up

Story and flow live on **CruiseGame + arcade garage**. Not a new engine.

`car-travel-game` (pmndrs racing-game fork) is harvested for **paint picker, map overlay, camera cycle, reset, boost numbers** — mapped onto existing `Gearbox` / `PAINTS` / GPS chrome. **Do not** import R3F or Cannon.

## Beats

1. Avatar (4-slot Foundry / crest) — other roster heroes are street NPCs.
2. Dice cinema → *“Roll em up and roll em out, I just won a car”*
3. Pick **one of 3** junk starters (Datsun / NSX / Supra), **0/5 tune**
4. Spawn **on foot**, walk to car, **E** enter
5. Phone: cousin wants the car back, **$1000** race
6. Player: *not racing till I tune — go to the shop*
7. GPS arrow a few blocks → **Midnight Tune** interior (paints / bolt-ons / stats)
8. Open-world jobs + AI pull-up races (existing challenge offers)
9. When shop visited + at least one tune (or $400), GPS **Cousin's lot** → mission 1

## Map

LA Gangwar (`la-gangwar.glb`) stays the city. Shop / cousin POIs are metres on that mesh (`campaign.ts`).

## Persist

`garageStateLocal` `campaignBeat` + `shopVisited` + `tuning` + `currency`.
