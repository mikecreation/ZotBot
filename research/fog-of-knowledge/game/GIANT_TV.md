# Giant telescopic house-TV

House-tall fold-out MicroLED (C SEED M1 / Bugatti fold-into-floor vibe) for Fog of Knowledge.

## Size

Open height matches the woodland **foresthouse chimney top**: `HOUSE.chimney.top = 4.75` m (`woodland-progression.js`). Closed / telescoped state stays near the ground on a recessed floor track.

## Fold / unfold

1. Recessed metallic **floor track** + pedestal.
2. Closed: thick vertical **monolithic column** of stacked panels.
3. Opens by **rising + unfolding**: five vertical rectangular panels accordion into one seamless wide screen (not a single slab lerp).

## Place / open

- Craft **House TV kit** (`giant_tv_kit`) after optics, or DEV grant and place with Q.
- After place: **E** or click the TV (far raycast OK in watch entry) -> highlight + `tvWatch` camera (face-on, character still visible).
- **Open / Close** in the watch UI toggles the rise/unfold animation.
- Esc exits watch mode (TV can stay risen).

## YouTube / no-ads

**Primary watch path: [Piped](https://piped.video/)** - open-source YouTube frontend, no ads, embed support.

- Home: `https://piped.video/`
- Embed: `https://piped.video/embed/VIDEO_ID`
- Optional toggle: Official YouTube (`youtube-nocookie.com` embed). Note: youtube-nocookie does **not** remove ads (only non-personalized tracking); Piped/Invidious do.

Research sources (public client-side frontends only; no credential theft / malware):

- Piped project / instances - ad-free embeds: https://piped.video/ and https://github.com/TeamPiped/Piped
- Invidious (also ad-free) documented as alternate pattern
- Official `youtube-nocookie.com` documented as privacy-oriented embed that still serves ads

## Google login

Piped does not use Google OAuth. A **Sign in with Google** button `window.open`s the Google account picker / YouTube continue URL on a **user-gesture click** (popup allowed). Manual login or account click in the popup; return focus to the embed. Not iframe-trapped OAuth.

## Chassis color

Watch UI presets: Black, Red, Deep blue, Deep cool orange + HTML color wheel. Stored on the structure as `tvColor` (persists with world save).

## Audio

Separate Web Audio graph with HRTF `PannerNode` at the screen - **mixes on top of** Fog `audio.js` ambience (wind/rain/birds are never muted). Volume slider + Mute in UI; `+` / `-` / `M` while watching. Soft presence bed is spatial; program audio comes from the embed.

## Rainproof

Outdoor OK in rain - no water damage, no deactivate-in-rain logic. Sealed chassis.

## Cache

Bump `index.html` / `world.js` imports to **3.51.0+** when shipping.
