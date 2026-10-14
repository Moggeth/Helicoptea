# Playing with a Steam Controller

Browsers can't read a Steam Controller as a gamepad by themselves. On the desktop, Steam drives it in "desktop mode" as a mouse and keyboard. To a game running in a browser, it only appears as a gamepad when **Steam Input** presents it as an Xbox-style controller to that browser process. The most reliable way to set that up is to launch the browser from Steam.

## One-time setup (about 2 minutes)

1. Serve the game: `npm run build`, then `npx vite preview --port 4178` (the game is then at http://localhost:4178/; use whatever port you serve it on).
2. In Steam, choose **Games → Add a Non-Steam Game to My Library… → Browse…**, pick `C:\Program Files\Google\Chrome\Application\chrome.exe`, then click **Add Selected Programs**.
3. Right-click the new **Google Chrome** entry and choose **Properties…**:
   - Rename it to `Helicoptea`.
   - Under **Launch Options**, paste:
     ```
     --user-data-dir="C:\Users\<you>\AppData\Local\Helicoptea-Chrome" --app=http://localhost:4178/
     ```
     The separate profile folder makes Steam start a fresh Chrome process that it can attach Steam Input to. Without it, Chrome hands the window to your already-open browser, and the controller stays in mouse mode.
4. In the same Properties window, open **Controller** and set the override to **Enable Steam Input**.
5. Launch **Helicoptea** from your Steam library. Open the controller layout (Steam button → Controller settings, or the controller icon on the game's page) and choose **Templates → Gamepad**.

## Check it in the game

Open **Pause → Controller → Settings** (or press **Back/View** on the pad). You should see:

> **Xbox-compatible controller** · standard layout, ready · rumble

That's the Steam Controller as presented by Steam Input. Move the sticks or trackpads and the two dots will follow them. Rumble plays on crashes, bumps, hooking a bag and splashes. Press **Test rumble** to check it.

- **"No controller detected"**: press any button on the controller. Browsers hide controllers until they see input. If it still doesn't appear, the browser wasn't launched through Steam, or Steam Input is off for that entry.
- **Layout**: the same screen picks a preset (Aim, Aim southpaw, Classic RC Mode 2, RC Mode 1, Arcade) or lets you change any stick or button, with an invert per axis. See the README's Controls section.
- **"Steam Controller · unknown layout"**: Chrome is reading the raw device instead of the Steam Input pad. Press **Teach it an odd pad…** and follow the prompts (move each stick or trackpad, then press each button). That only tells the game where things are; the layout decides what they do. It is saved for that controller.
- Adjust **dead zone**, **fine control near centre**, the three sensitivities and rumble on the same screen. These are stored in the browser profile, so the separate Steam profile keeps its own settings.

## Default layout (Aim, Gamepad template)

| Control | Input |
|---|---|
| Pitch (tilt forward / back) | Right stick or right trackpad up/down |
| Turn (yaw) | Right stick or right trackpad left/right |
| Lift (collective) | Left stick up/down |
| Roll (tilt sideways) | Left stick left/right |
| Hook / release | A or RB (A also restarts after a crash) |
| Pour milk | RT (two quick pulls latch it open) |
| Bolted-on camera | hold LT |
| Mark a moment for a flight note | LB or right stick click |
| Skycrane | RT belly doors, LB pump (twice = auto-fill), D-pad up/down reel the hose |
| Flight Assist | Y |
| Restart flight | Start (Menu) |
| Pause menu | Back (View) |
| Controls help | X |
| Recenter camera | B |
| Change view / look around | left stick click (tap) / hold it and use the right stick |
| Camera orbit / zoom | D-pad |
| Menus | D-pad or left stick to move, A select, B back, left/right adjusts sliders and switches layouts |

On the Steam Controller, the right trackpad set to **Joystick Move** in the Gamepad template suits the Aim layout well: pitch and turn on one pad, like aiming. Not yet tried on a real Steam Controller with these layouts.
