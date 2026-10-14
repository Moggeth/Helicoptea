# Playing with a Steam Controller

For a Steam Controller on Windows with its wireless dongle, use **Steam Input** to present an Xbox-style gamepad to the browser. Desktop configurations may instead send mouse and keyboard input, which will not appear in Helicoptea's controller settings. Launch a dedicated browser instance from Steam so the game's controller layout applies to it. Raw-device support can vary; the instructions below use Steam Input's gamepad emulation.

## One-time setup (about 2 minutes)

1. Connect the dongle, switch on the controller, and check that Steam's **Settings → Controller** detects it. The game is hosted at **https://helicoptea.vercel.app/**; no local server is needed.
2. In Steam, choose **Games → Add a Non-Steam Game to My Library… → Browse…**, pick `C:\Program Files\Google\Chrome\Application\chrome.exe`, then click **Add Selected Programs**.
3. Right-click the new **Google Chrome** entry and choose **Properties…**:
   - Rename it to `Helicoptea`.
   - Under **Launch Options**, paste:
     ```
     --user-data-dir="C:\Users\<you>\AppData\Local\Helicoptea-Chrome" --app=https://helicoptea.vercel.app/
     ```
     Replace `<you>` with your Windows username. The separate profile prevents Chrome from handing the window to an already-running browser process outside this Steam shortcut. Settings and recordings in this profile are separate from your usual browser's local data.
4. In the same Properties window, open **Controller** and set the override to **Enable Steam Input**.
5. Launch **Helicoptea** from your Steam library. Open the controller layout (Steam button → Controller settings, or the controller icon on the game's page) and choose **Templates → Gamepad**.

## Check it in the game

Press a controller button with the game focused, then open **Pause → Controller → Settings** (**Back/View** opens Pause). With gamepad emulation active, you should see an Xbox-compatible controller and a standard layout. If the browser also exposes a vibration actuator, the status includes rumble:

> **Xbox-compatible controller** · standard layout, ready · rumble

That's the Steam Controller as presented by Steam Input. Move the sticks or trackpads and the two dots will follow them. The game requests rumble on crashes, bumps, hooking a bag and splashes. Press **Test rumble** to check the actual device; an advertised actuator does not establish that feedback is felt through this Steam configuration.

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

For the original Steam Controller, set the right trackpad to **Joystick Move** targeting the right stick for the Aim layout: pitch and turn on one pad. Disable trackball-style continuation for this flight-control mapping so releasing the pad returns the command to centre. On a model with two sticks, start with both sticks before adding trackpad or gyro bindings.

## Hardware acceptance still required

The automated checks use an emulated standard gamepad. They do not verify the physical Steam Controller, dongle, Steam configuration or haptic feel. Verify these on the intended PC:

- Start flying, pause, change an aircraft, resume and restart after a crash using only the controller.
- Confirm all four flight axes, both trigger actions, hook/release, camera switching and recentering. Release each stick or pad and confirm its command returns to neutral.
- Switch the controller off during flight: commands must release. Reconnect and confirm input returns without a page reload.
- Test rumble, then a hook and a crash. Check that pause stops ongoing feedback.

Steam Input can map gyro, trackpads and grips onto inputs the game already understands. This browser build does not use the native Steam Input API: independently exposed grip actions, native device glyphs and precise trackpad haptics are not promised by Xbox-style emulation. Native integration would require a separate platform integration; it is not supplied by hosting on Vercel.

References: [Valve's gamepad emulation guidance](https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices) and [original Steam Controller configuration support](https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=353370&issueid=362&nodeid=30&return_nodeid=2).
