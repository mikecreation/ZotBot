# Hands, fire, atmosphere and feedback (2026-10-20)

## Controls

- **V** selects the other hand. The two clickable HUD hand buttons show which hand is selected.
- **1–0** and clicking a hotbar item equip the selected hand. Shift+number remains a direct left-hand shortcut.
- **Q / captured left-click** use the selected hand. **F** observes its item.
- **R** stows the selected hand; **Shift+R** stows both. **X** swaps the actual held objects.
- Inventory counts remain shared stacks. A singleton item moves between hands; it cannot be duplicated. Consuming a left-hand item preserves the right-hand object.

## Fire

Added fuel grows the flame, wood bed, light radius and radiant heat. The old size ceiling near 14 kg is raised to a bounded 48 kg response; additional fuel beyond that still lasts longer. Cooling and wetting use real seconds while fuel use follows accelerated game time. Sheltered fires and kilns resist rain. Exposed small fires take sustained rain to extinguish; larger beds take longer. Rain never deletes the fire structure or remaining fuel.

Burned wood leaves a small charcoal fraction and ash. After the bed cools, **E** collects the residue; inventory overflow preserves what could not be collected. Charcoal can be fed back into fires. Moisture, fuel and residue survive saves; renderer objects are excluded from serialization. Existing saves default missing fields safely.

This is a gameplay approximation, not a calibrated combustion experiment. The qualitative treatment of moisture and larger fuels is informed by [NWCG's weather and fuel moisture guidance](https://www-nwcg.fs2c.usda.gov/publications/pms425-1/11-weather-and-fuel-moisture). All numeric yields and cooling times here are game tuning values.

## Visuals and sound

World-space terrain grit and surface relief, bark/rock detail, rain-responsive material wetness, branched tree silhouettes with pointed leaf geometry, fuller grass, shaped flame cores and stacked logs improve the existing renderer. Low/High/Ultra remain available. Twelve animated birds form three flocks with two instanced draws; daylight and rain control their visibility.

Lightning uses a brief double pulse in the sky shader, clouds, fog and actual directional/hemisphere lighting, including Low quality. Thunder retains the distance/343-second delay and varies its noise envelopes, stereo position, spectrum and rolling tails. There is no persistent exposure increase after the flash.

Ambience uses independently generated 23–37-second noise beds, different offsets and smoothly varying spectra/gusts, plus irregular contextual events. It avoids the former short synchronized loops. Bird calls are occasional by day. Pet voices are throttled across all pets, passive whining is suppressed, and wolf howls have a global cooldown. These are procedural sounds; recorded-field-audio realism is not claimed.

Reward tones have one explicit gate: a unique first-time **discovery** or **level_up** event. Stamina, percentages, XP increments, warning reminders, curiosity hints, routine UI, pendulum ticks and duplicate events cannot trigger celebration sounds. Pickup feedback is a quiet rustle with a cooldown. Physical action/weather sounds remain. Sprint exhaustion uses a recovery threshold to avoid toggling every frame near empty stamina.

Both Celsius and Fahrenheit appear in body/air HUDs, fire/kiln prompts, warnings, cooking/boiling explanations, journal and physics readouts. Temperature differences convert without adding 32.

## Verification

The initial in-browser regression run passed **246/246** checks. After final changes, the targeted set passed **11/11**, including cooled residue collection/reuse, true sky/ground illumination with restoration and delayed thunder, dual-unit readouts, saves, and selected-hand consumption. The final complete run passed 248/249; the remaining existing pendulum fixture allowed a wandering pet to intercept its second interaction. The fixture now aims at the mechanism from 0.9 m; a subsequent 14/14 pendulum-plus-upgrades run passed. The final focused lighting, inventory, pendulum and upgrade run passed 42/42.

Run the real game integration suite at `game/tests/runner.html`. It yields between tests and explicitly mutes its isolated iframe (`?verification=1`), so automated rewards cannot play over the user's game. It uses its current origin's save storage; run it on a separate localhost preview origin, never over a real play session.

Pure rule/scheduling checks:

```text
node game/tests/fire-model.test.mjs
node game/tests/audio-units.test.mjs
```

They cover sustained rain, shelter, fuel preservation, residue, time-step consistency, growth above the previous cap, flash envelope, temperature conversion, independent noise layers, contextual scheduling/pause, and milestone-only reward semantics. Audio scheduling tests do not substitute for subjective listening.
