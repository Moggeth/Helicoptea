// Little side-on pictures of each aircraft for the pickers (title card and pause menu), facing right in
// their in-game liveries. Outlines, blades and skids use currentColor, so they read on the dark title
// card, the cream menu and a selected button alike.
const SVG = (body) => `<svg class="ac-icon" viewBox="0 0 64 40" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const disc = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="1.6" fill="currentColor" fill-opacity="0.12" stroke="none"/>`;
const blade = (x1, x2, y) => `<path d="M${x1} ${y}H${x2}" stroke-width="1.8"/>`;

export const AIRCRAFT_ICONS = {
  // Light utility heli: white pod, navy belly stripe, red fin, two-blade rotor, skids.
  micro: SVG(`
    ${disc(33, 7, 27)}${blade(8, 58, 7)}
    <path d="M33 7v4"/>
    <path d="M27 18 L7 15.5 L7 18.5 L27 23Z" fill="#eeeeea"/>
    <path d="M4.5 18 L3 9.5 L6.5 9.5 L9 17Z" fill="#c4262a"/>
    <circle cx="5.5" cy="13" r="3.6" fill="currentColor" fill-opacity="0.12"/>
    <path d="M28 11.5h11v2.5H28Z" fill="#c8ccd2"/>
    <path d="M24 22c0-7 7-10 16-10 8 0 13 4.5 13 9.5 0 4.5-3.5 6.5-9 6.5H29c-3 0-5-2-5-6Z" fill="#eeeeea"/>
    <path d="M25 24.5c1 2.4 2.6 3.5 4.5 3.5H44c4 0 7-1.2 8.3-3.5Z" fill="#18263e" stroke="none"/>
    <path d="M41 13.2c5.5.4 9.6 3.2 10.8 7.8H41Z" fill="#8fb2bc"/>
    <path d="M33 13.5h6v7.5h-7Z" fill="#8fb2bc"/>
    <path d="M30 28l-1.5 5M46 28l1.5 5"/>
    <path d="M24 33h29c2 0 3-1 3.5-2.5" stroke-width="1.6"/>`),
  // Tandem-rotor transport: long olive body, tall aft pylon, two rotors, sponson, wheels.
  chinook: SVG(`
    ${disc(16, 6, 15)}${disc(47, 10, 15)}
    <path d="M7 17.5 L9 8.5h8.5l1.5 9Z" fill="#3a4029"/>
    <path d="M13 8.5V6M47 13v-3"/>
    <path d="M43 13.5h8l1 3.5h-9Z" fill="#3a4029"/>
    <path d="M6 18.5c0-1 1-1.5 2-1.5h43c5 0 8 3.5 8 7.5S56 31 52 31H20l-9-4.5L6 22Z" fill="#4b5236"/>
    <path d="M51.5 18.5c3 .3 5.4 2.6 6 5.5h-6Z" fill="#8fb2bc"/>
    <path d="M45.5 18.5h4v5.5h-4Z" fill="#8fb2bc"/>
    <path d="M24 26h18c1.5 0 2.5 1 2.5 2.5S43.5 31 42 31H24c-1.5 0-2.5-1-2.5-2.5S22.5 26 24 26Z" fill="#3a4029"/>
    <circle cx="22" cy="21.5" r="1.3" fill="#8fb2bc"/><circle cx="29" cy="21.5" r="1.3" fill="#8fb2bc"/><circle cx="36" cy="21.5" r="1.3" fill="#8fb2bc"/>
    <path d="M48 31v2M16 29.5v3.5"/>
    <circle cx="48" cy="34.5" r="2.2" fill="#141512"/><circle cx="16" cy="34.5" r="2.2" fill="#141512"/>
    ${blade(1, 31, 6)}${blade(32, 62, 10)}`),
  // Crane tanker: glazed cockpit pod, thin spine, high tail, long legs, orange milk tank and hose.
  skycrane: SVG(`
    ${disc(32, 6, 26)}${blade(7, 57, 6)}
    <path d="M32 6v4.5"/>
    <path d="M25 10.5h14l1 3H24Z" fill="#c0c4c8"/>
    <path d="M17 13.5h29v3.5H17Z" fill="#ec6a1c"/>
    <path d="M18 14.5 L7 9 L6 11.5 L17 17Z" fill="#ec6a1c"/>
    <path d="M6.5 11 L4 2.5h3.5L10 10Z" fill="#ec6a1c"/>
    <circle cx="6" cy="5.5" r="3.4" fill="currentColor" fill-opacity="0.12"/>
    <path d="M44 14c0-2.5 2-4 5-4 5 0 9.5 4 9.5 9.5 0 4-2.5 6.5-6.5 6.5H48c-2.5 0-4-1.5-4-4Z" fill="#f2efe8"/>
    <path d="M44 20.5h14.3c-.4 3.4-2.8 5.5-6.3 5.5H48c-2.5 0-4-1.5-4-4Z" fill="#1d6a3a" stroke="none"/>
    <path d="M50 11.2c4 .6 7.2 3.6 8 7.8h-8Z" fill="#9cc3d4"/>
    <path d="M21 17l-2 15M42 17l2 15"/>
    <circle cx="19" cy="34" r="2" fill="#151515"/><circle cx="44" cy="34" r="2" fill="#151515"/>
    <path d="M25 19.5h15c1 0 1.5.5 1.5 1.5v6c0 1-.5 1.5-1.5 1.5H25c-1 0-1.5-.5-1.5-1.5v-6c0-1 .5-1.5 1.5-1.5Z" fill="#ec6a1c"/>
    <path d="M24 17v2.5M41 17v2.5"/>
    <path d="M30.5 28.5c0 3-2 4-4 5.5" stroke-width="1.6"/>`),
};
