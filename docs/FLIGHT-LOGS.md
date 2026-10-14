# Flight logs, replay and feel notes

Every flight is recorded automatically, for all three aircraft. You can replay any recent flight, scrub
through it with its telemetry, and leave notes tagged **good** or **bad** at exact moments. Flights and
notes are saved to `logs/flights/` (gitignored), so a later Claude session can read your notes next to the
numbers when tuning the flight model.

## Using it

**Marking a moment in flight**: press **N** (gamepad **R3**, a click of the right stick; touch **⚑ Mark**;
or the flag icon top right). It drops an untitled *mark* at that instant; describe it later in the replay.

**Opening the replay**: **Pause → Flight replay**, or **Watch replay** on the crash screen (it starts
5 seconds before the crash). The world stays frozen while you watch; closing goes back where you were.

| | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Play / pause | Space (or K) | A (or Start) | ▶ |
| Frame step | ← / → (or , .) | D-pad ← / → (hold to repeat) | ◀︎\| \|▶︎ |
| Jump 1 s | Shift+← / Shift+→ | | −1s / +1s |
| Scrub | click or drag the timeline or graphs; Home / End | triggers (RT forward, LT back) or left stick | drag the timeline or graphs |
| Speed 0.1× to 2× | [ and ] (or − =) | LB / RB | tap the speed button to cycle |
| Camera: chase, orbit, cockpit | 1 2 3, or C to cycle | D-pad ↑ / ↓ | tap the camera button to cycle |
| Look / orbit / zoom | drag the picture, wheel | right stick | drag, pinch |
| Good / bad / plain note | G / B / N, type, Enter | Y good, X bad (no text) | type, then Good / Bad / Note |
| Show / hide graphs | H | | Graphs |
| Close | Esc | B (or Back) | Close |

In the notes list, click a time to jump there, click the tag to change it (good, bad, note), type into a
note to edit it, and × deletes it. Notes save themselves.

1× plays at the speed you flew (the World weight slows the world clock; the replay honours it). Times are
**as flown**: the clock you experienced, so "0:12" is twelve seconds into the flight from your point of view.

The graphs show, around the playhead (5 s, 10 s, 30 s or the whole flight): the processed sticks (pitch,
roll, yaw, collective), gear height above the surface, horizontal and vertical speed, and rope tension (the
skycrane shows its tank). The readout top left shows height, speed, attitude, body rates, collective, thrust,
T/W and load, with the sticks drawn as two boxes (on a gamepad, the faint blue dot is the raw stick before
the dead zone and curve).

## What is recorded

At 60 Hz (every 4th physics step), in `src/replay/recorder.js`:

- **Channels** (one row per sample, all 83 listed with units in `src/replay/format.js` `CHANNELS` and copied
  into each flight's `channelInfo`): time (`t` simulated, `wall` as flown), world speed, Assist, the input
  device, the processed inputs the aircraft received (`in.*`), each device's own input (`kb.*`, `gp.*`,
  `touch.*`), the active gamepad's raw axes and triggers, aircraft position, orientation, velocity, body
  rates, attitude and heading, speeds, gear and hub height above the surface, collective, thrust, thrust
  fraction, T/W including the load, rotor speed and phases, disc tilts, the assist's commanded attitude and
  the rotor mix, rope tension and carried mass, bag wetness and immersion, bucket fill, the skycrane's tank,
  doors, pump, hose length and intake depth, and the crash detector's state.
- **Entities**, keyframed only when they move (with a hold key before each change, so interpolation is exact
  to 0.1 to 0.15 mm): every tea bag with its string, wetness and stain; the milk bucket with its fill and
  line; the skycrane's snorkel hose; every piece of wreckage (with its part name); the loose props, the
  lamp and the mobile.
- **Events**: crash (reason, impact speed), bump, touchdown, scrape, snatch, rotor tick, attach, release,
  splash, extract, bucket splash, auto-fill phases, radio, restart, reset, aircraft switch.

A flight runs from take-off position to the next restart, reset or aircraft switch; after a crash, 10 more
seconds of wreckage are kept. A flight longer than 15 minutes continues in a new log. The last 12 flights
(at most 96 MB) stay in memory; finished flights are saved to disk. Recording costs about 10 µs per physics
step (measured: 9 to 16 µs against 250 to 290 µs of simulation). `?record=0` turns it off.

Not recorded: the air field, cups' tea colour and levels, milk streams and puddles, steam, the cat and the
apples. The replay shows the cups as they are now.

## Replay

`src/replay/stage.js` poses the scene straight from the snapshots, interpolated between samples (positions
linearly, attitudes by slerp, rotor phases the short way round). Nothing is re-simulated, so a replay is
exactly what was recorded (checked: the replayed airframe matches the snapshot to 0 m). The crash plays its
explosion and dust from the logged events. `src/replay/viewer.js` is the UI.

## On disk

`vite dev` and `vite preview` (including the stable build on 4178) serve a small endpoint
(`tools/flight-log-plugin.js`) that writes into `logs/flights/` next to `vite.config.js`:

```
logs/flights/<id>.json   header, channel names and units, entity index, events, notes, summary
logs/flights/<id>.bin    little-endian Float32: samples, then each entity's keys
```

`<id>` is `YYYYMMDD-HHMMSS-<aircraft>-<n>` in local time. A static build hosted elsewhere (the Vercel
deploy) has no endpoint: flights and notes are saved in that browser's IndexedDB instead (the newest 40),
or kept in memory if the browser refuses storage, and the viewer says which.

The viewer's **Download** button saves the current flight and its notes as one `<id>.json` with the binary
embedded as base64 (`binBase64`). Put it in `logs/flights/` and `tools/flight-notes.mjs`, the replay viewer
on the dev server and everything else read it like a flight the server saved.

**JSON header** (the useful fields):

```json
{
  "format": "helicoptea-flight", "version": 1, "id": "20261014-094649-micro-001",
  "aircraft": "micro", "def": { "mass": 0.024, "thrustToWeight": 2.3, "hooks": [[0, -0.02, 0]] },
  "recordHz": 60, "physicsHz": 240, "nSamples": 377, "duration": 4.58, "wallDuration": 6.55,
  "channels": ["t", "wall", "worldSpeed", "assist", "..."],
  "channelInfo": { "agl": "m: skid / gear clearance above the surface below", "...": "..." },
  "kinds": { "bag": ["px", "py", "pz", "qx", "qy", "qz", "qw", "wetness", "stain", "attach", "rope0.x", "..."] },
  "entities": [{ "id": "bag:3", "kind": "bag", "meta": {}, "width": 56, "born": 0, "died": -1, "nKeys": 88, "offset": 31291 }],
  "events": [{ "type": "touchdown", "i": 212, "t": 3.53, "wall": 5.05, "speed": 0.31, "pos": [-0.56, 0.08, 0.24] }],
  "notes": [{ "id": "n…", "i": 183.0, "t": 3.05, "wall": 4.36, "tag": "bad", "text": "pitched up too much", "source": "viewer" }],
  "summary": { "maxSpeed": 0.67, "maxAgl": 1.1, "crash": { "reason": "impact", "impact": 2, "wall": 4.74 }, "...": "..." },
  "settings": { "view": "chase", "quality": "high", "weight": 0.5 }
}
```

**Binary**: `nSamples × channels.length` floats (row-major, columns in `channels` order), then for each
entity `nKeys × width` floats starting at its `offset` (in floats). A key row is `[sampleIndex, ...kind
fields]`. An entity exists from sample `born` up to (not including) `died` (`-1`: until the end). Between
keys, interpolate linearly (quaternions normalised); before a change after a still spell there is always a
key one sample earlier, so no motion is smeared. `attach` is 0 free, −1 on its peg or hanger, else the hook
index + 1. Notes `tag`: `good`, `bad`, `note`, or `mark` (dropped in flight, maybe without text). `i` is the
fractional sample index, `t` simulated seconds, `wall` as-flown seconds.

`src/replay/format.js` `decodeFlight(json, arrayBuffer)` loads a flight in Node or the browser.

## For Claude: summarising a flight's notes with its telemetry

```bash
node tools/flight-notes.mjs                      # newest flight with notes
node tools/flight-notes.mjs all                  # every flight with notes
node tools/flight-notes.mjs 20261014-0946        # one flight by id prefix
node tools/flight-notes.mjs latest --window 2    # ±2 s around each note
node tools/flight-notes.mjs latest --csv 3.0-4.5 --channels wall,in.pitch,pitch,rate.pitch,agl
node tools/flight-notes.mjs all --json           # machine-readable
```

For each note it prints the flight (aircraft, length, world speed, devices, Assist share, crash), then the
note's time, tag and text, whether Assist was on, the device, what was on the hook, a table of the feel
channels at the note and their min / mean / max over the window (sticks, collective, thrust, T/W, height,
speeds, attitude, body rates, rope tension, load) and the events in the window (touchdowns, snatches,
bumps, the crash). Read the note text as the pilot's verdict and the table as what the aircraft did; when a
note says something felt wrong, compare the stick inputs (`in.*`, and the device's own `gp.*` / `kb.*` /
`touch.*`) with the response (`rate.*`, `pitch` / `roll`, `vspeed`) and the assist's targets (`cmdPitch`,
`cmdRoll`, `mix.*`) before changing tuning in `src/config.js`. `--csv` gives the raw rows for a closer look.
