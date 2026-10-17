// The guided flight's card art: a small looping picture of each skill, and a picture of the control that does
// it on the device in hand. Inline SVG animated by CSS (styles.css, .ls-*), built once per step, so nothing
// runs per frame and nothing is loaded. Each scene is a 120 x 90 picture; each control about 110 x 90.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The micro heli side on, nose left, skids at y = 0, about 50 wide.
const HELI = `<g class="ls-heli-body">
  <rect x="-27" y="-30" width="54" height="3.5" rx="1.75" class="ls-rotor"/>
  <rect x="-1.5" y="-28" width="3" height="7" class="ls-ink"/>
  <path d="M-16 -9 C-16 -19 -8 -22 2 -22 C10 -22 14 -17 14 -11 L14 -7 C14 -5 12 -4 10 -4 L-12 -4 C-15 -4 -16 -6 -16 -9 Z" class="ls-hull"/>
  <path d="M-13 -12 C-13 -17 -9 -19 -4 -19 L-4 -11 Z" class="ls-glass"/>
  <path d="M13 -14 L34 -16 L34 -13 L13 -9 Z" class="ls-hull"/>
  <path d="M32 -22 L36 -22 L36 -12 L32 -12 Z" class="ls-ink"/>
  <path d="M-12 -4 L-13 -1 M8 -4 L9 -1 M-17 0 L14 0" class="ls-line"/>
</g>`;
const heli = (cls = '', x = 60, y = 62, extra = '') => `<g transform="translate(${x} ${y}) scale(1.15)"><g class="ls-a ${cls}">${HELI}${extra}</g></g>`;
const pad = (x = 60, y = 64) => `<ellipse cx="${x}" cy="${y + 2}" rx="24" ry="4" class="ls-pad"/>`;
const ground = (y = 66) => `<path d="M8 ${y} H112" class="ls-line ls-soft"/>`;
const cup = (x, y, tea = 'ls-tea', cls = '') => `<g transform="translate(${x} ${y})" class="${cls}">
  <path d="M-15 -20 H15 L12 0 H-12 Z" class="ls-cup"/><path d="M15 -15 C22 -15 22 -6 13 -6" class="ls-line"/>
  <path d="M-13.5 -15 H13.5" class="ls-line ls-soft"/><path d="M-13 -14 H13 L11.5 -1.5 H-11.5 Z" class="${tea}"/></g>`;
const bag = (x, y) => `<g transform="translate(${x} ${y})"><rect x="-6" y="0" width="12" height="13" rx="1.5" class="ls-bag"/><rect x="-3" y="-4" width="6" height="4" class="ls-tag"/></g>`;
const bucket = (x, y, fill = '') => `<g transform="translate(${x} ${y})"><path d="M-8 -2 H8 L6 12 H-6 Z" class="ls-bucket"/>${fill}<path d="M-8 -2 C-6 -10 6 -10 8 -2" class="ls-line"/></g>`;
const svg = (body, w = 120, h = 90, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="${cls}" aria-hidden="true" focusable="false">${body}</svg>`;

// One looping picture per step of the lesson.
const SCENES = {
  lift: () => svg(`${ground()}${pad()}${heli('ls-rise')}<path d="M98 54 V26 M92 33 L98 26 L104 33" class="ls-arrow ls-blink"/>`),
  hover: () => svg(`${ground()}<ellipse cx="60" cy="67" rx="16" ry="2.5" class="ls-shadow ls-breathe"/>${heli('ls-bob', 60, 44)}<path d="M22 30 h8 M90 30 h8 M24 38 h4 M92 38 h4" class="ls-line ls-soft"/>`),
  drift: () => svg(`${ground()}${heli('ls-drift', 36, 50)}<path d="M74 26 H100 M93 19 L100 26 L93 33" class="ls-arrow ls-blink"/>`),
  turn: () => svg(`<g transform="translate(56 42)"><circle r="34" class="ls-disc"/><g class="ls-a ls-spin">
    <path d="M0 8 V36" class="ls-line ls-thick"/><path d="M-7 34 H7" class="ls-line ls-thick"/>
    <ellipse rx="10" ry="15" class="ls-hull"/><ellipse cy="-8" rx="7" ry="5.5" class="ls-glass"/>
    <path d="M-26 -14 L26 14 M-26 14 L26 -14" class="ls-line ls-thick"/></g></g>
    <path d="M96 22 A40 40 0 0 1 104 46" class="ls-line"/><path d="M99 40 L104 47 L109 40" class="ls-line"/>`),
  stop: () => svg(`${ground()}${heli('ls-stop', 32, 52)}<path d="M8 30 h12 M4 38 h14" class="ls-line ls-soft ls-trail"/><path d="M100 18 V58" class="ls-line ls-dash"/>`),
  land: () => svg(`${ground()}${pad()}${heli('ls-land')}<path d="M98 26 V54 M92 47 L98 54 L104 47" class="ls-arrow ls-blink"/>`),
  hook: () => svg(`<path d="M90 44 V84 M78 84 H102" class="ls-stand"/><path d="M90 48 H76" class="ls-stand"/>${bag(76, 56)}
    ${heli('ls-reach', 36, 42, '<path d="M0 -2 V10" class="ls-line"/><path d="M0 10 c0 4 4 4 4 1" class="ls-line ls-thick"/>')}`),
  dip: () => svg(`${cup(60, 82, 'ls-tea ls-steep')}<g class="ls-a ls-dunk"><path d="M60 0 V40" class="ls-line"/>${bag(60, 42)}</g>`),
  drop: () => svg(`<ellipse cx="60" cy="82" rx="26" ry="5" class="ls-cup"/>${heli('', 60, 40, '<path d="M0 -2 V6" class="ls-line"/>')}<g class="ls-a ls-fall">${bag(60, 52)}</g>`),
  bucket: () => svg(`<path d="M94 40 V86 M82 86 H106" class="ls-stand"/><path d="M94 44 H78" class="ls-stand"/><path d="M78 44 V58" class="ls-line"/>${bucket(78, 66)}
    ${heli('ls-reach', 36, 42, '<path d="M0 -2 V10" class="ls-line"/><path d="M0 10 c0 4 4 4 4 1" class="ls-line ls-thick"/>')}`),
  fill: () => svg(`<path d="M34 60 H86 L82 84 H38 Z" class="ls-crock"/><path d="M36 66 H84" class="ls-milk-line"/>
    <g class="ls-a ls-dunk"><path d="M60 0 V36" class="ls-line"/>${bucket(60, 44, '<path d="M-6.5 10 H6.5 L6 12 H-6 Z" class="ls-milk ls-fillup"/>')}</g>`),
  pour: () => svg(`${cup(60, 86, 'ls-tea ls-lighten')}<path d="M60 0 V18" class="ls-line"/>${bucket(60, 26)}
    <g class="ls-drops"><circle cx="60" cy="44" r="2.2" class="ls-milk"/><circle cx="60" cy="52" r="2" class="ls-milk"/><circle cx="60" cy="60" r="1.8" class="ls-milk"/></g>`),
  assist: () => svg(`<rect x="22" y="30" width="76" height="34" rx="17" class="ls-switch"/><circle cx="81" cy="47" r="13" class="ls-a ls-knob ls-flip"/>`),
  raw: () => svg(`${ground()}<ellipse cx="60" cy="67" rx="16" ry="2.5" class="ls-shadow"/>${heli('ls-wobble', 60, 44)}`),
  camera: () => svg(`<g class="ls-a ls-frames"><rect x="18" y="20" width="50" height="36" rx="5" class="ls-frame f1"/><rect x="32" y="28" width="50" height="36" rx="5" class="ls-frame f2"/><rect x="46" y="36" width="50" height="36" rx="5" class="ls-frame f3"/></g>
    <g transform="translate(60 50)"><rect x="-14" y="-9" width="22" height="18" rx="3" class="ls-ink"/><path d="M8 -4 L16 -9 V9 L8 4 Z" class="ls-ink"/></g>`),
  done: () => svg(`${cup(60, 82)}<g class="ls-steam"><path d="M52 52 c-6 -8 6 -12 0 -20" class="ls-line ls-soft"/><path d="M62 52 c-6 -8 6 -12 0 -20" class="ls-line ls-soft"/><path d="M72 52 c-6 -8 6 -12 0 -20" class="ls-line ls-soft"/></g>
    <circle cx="94" cy="24" r="14" class="ls-ok ls-a ls-pop"/><path d="M87 24 l5 5 l9 -10" class="ls-tick"/>`),
};

export function sceneSVG(id) { return (SCENES[id] || SCENES.hover)(); }

// ---------------------------------------------------------------- controls
// A control is { type, ... } from Hud.lessonControl(): keys, arrows, stick, button, mouse, throttle, joystick.
// A key cap h tall (big for one or two keys, smaller in the arrow cluster); long names get smaller type.
const keycap = (label, x, y, w, cls = '', h = 44) => `<g transform="translate(${x} ${y})"><g class="${cls}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 5}" class="ls-key"/><text y="${h * 0.2}" class="ls-keytext${label.length > 3 ? ' small' : h < 40 ? ' mid' : ''}">${esc(label)}</text></g></g>`;
const keyW = (l, h = 44) => (l.length > 3 ? Math.min(104, 16 + l.length * 8.5) : Math.max(h, 18 + l.length * 15));

function keysSVG(c) {
  // One or two keys side by side, the held one pressing in and out.
  const ks = c.keys.slice(0, 2), ws = ks.map((k) => keyW(k)), gap = 8, total = ws.reduce((a, b) => a + b, 0) + gap * (ks.length - 1);
  let x = (110 - total) / 2, body = '';
  ks.forEach((k, i) => { body += keycap(k, x + ws[i] / 2, 45, ws[i], `ls-a ${c.hold ? 'ls-press' : ''}${i ? ' ls-late' : ''}`); x += ws[i] + gap; });
  return svg(body, 110, 90);
}

function arrowsSVG(c) {
  // Four keys as a cluster: forward on top, back, left and right below, pressing in turn.
  const [f, b, l, r] = c.keys, h = 33, w = (k) => keyW(k, h);
  return svg(`${keycap(f, 55, 24, w(f), 'ls-a ls-press ls-k1', h)}${keycap(l, 55 - 4 - w(l) / 2 - w(b) / 2, 64, w(l), 'ls-a ls-press ls-k2', h)}
    ${keycap(b, 55, 64, w(b), 'ls-a ls-press ls-k3', h)}${keycap(r, 55 + 4 + w(r) / 2 + w(b) / 2, 64, w(r), 'ls-a ls-press ls-k4', h)}`, 110, 90);
}

// A gamepad or a phone, with the stick in use lit and its knob moving the way to push it.
function stickSVG(c) {
  const left = c.side === 'left';
  const dirCls = { up: 'ls-up', down: 'ls-down', x: 'ls-sway', any: 'ls-circle', none: '' }[c.dir || 'any'];
  const knob = (cx, on) => `<g transform="translate(${cx} 48)"><circle r="14" class="ls-ring${on ? ' on' : ''}"/>${on ? `<circle r="7" class="ls-a ls-knob ${dirCls}"/>` : '<circle r="6" class="ls-knob off"/>'}</g>`;
  const body = c.touch
    ? `<rect x="6" y="20" width="98" height="56" rx="10" class="ls-device"/><rect x="40" y="26" width="30" height="20" rx="3" class="ls-screen"/>`
    : '<path d="M22 26 H88 C102 26 106 46 104 62 C102 76 92 78 84 68 L76 60 H34 L26 68 C18 78 8 76 6 62 C4 46 8 26 22 26 Z" class="ls-device"/>';
  return svg(`${body}${knob(c.touch ? 24 : 33, left)}${knob(c.touch ? 86 : 77, !left)}`, 110, 90);
}

function buttonSVG(c) {
  if (c.icon === 'camera') {
    return svg(`<g transform="translate(55 45)"><g class="ls-a ls-press"><circle r="22" class="ls-key"/><rect x="-11" y="-7" width="15" height="14" rx="2.5" class="ls-ink"/><path d="M5 -3 L11 -7 V7 L5 3 Z" class="ls-ink"/></g></g>`, 110, 90);
  }
  const long = c.label.length > 4, w = long ? Math.min(106, 22 + c.label.length * 8) : Math.max(44, 24 + c.label.length * 14);
  return svg(c.pad
    ? `<g transform="translate(55 45)"><g class="ls-a ls-press"><circle r="20" class="ls-key"/><text y="7" class="ls-keytext">${esc(c.label)}</text></g></g>`
    : `<g transform="translate(55 45)"><g class="ls-a ls-press"><rect x="${-w / 2}" y="-18" width="${w}" height="36" rx="18" class="ls-key"/><text y="${long ? 5 : 8}" class="ls-keytext${long ? ' small' : ' mid'}">${esc(c.label)}</text></g></g>`, 110, 90);
}

function mouseSVG(c) {
  const move = c.dir === 'x' ? 'ls-sway' : 'ls-circle';
  return svg(`<g transform="translate(55 47)"><g class="ls-a ${move}"><rect x="-15" y="-22" width="30" height="44" rx="15" class="ls-key"/><path d="M0 -22 V-6 M-15 -6 H15" class="ls-line"/></g></g>`, 110, 90);
}

function throttleSVG(c) {
  return svg(`<rect x="20" y="66" width="70" height="12" rx="4" class="ls-device"/><path d="M30 22 V70" class="ls-line ls-soft"/>
    <g transform="translate(55 70)"><g class="ls-a ${c.dir === 'down' ? 'ls-lever-back' : 'ls-lever'}"><path d="M0 0 V-38" class="ls-line ls-thick"/><rect x="-12" y="-50" width="24" height="16" rx="5" class="ls-key"/></g></g>`, 110, 90);
}

function joystickSVG(c) {
  const anim = c.dir === 'twist' ? 'ls-twist' : 'ls-tilt';
  return svg(`<ellipse cx="55" cy="74" rx="30" ry="7" class="ls-device"/><g transform="translate(55 72)"><g class="ls-a ${anim}"><path d="M0 0 V-40" class="ls-line ls-thick"/><rect x="-8" y="-58" width="16" height="24" rx="7" class="ls-key"/></g></g>`, 110, 90);
}

export function controlSVG(c) {
  if (!c) return '';
  switch (c.type) {
    case 'keys': return keysSVG(c);
    case 'arrows': return arrowsSVG(c);
    case 'stick': return stickSVG(c);
    case 'button': return buttonSVG(c);
    case 'mouse': return mouseSVG(c);
    case 'throttle': return throttleSVG(c);
    case 'joystick': return joystickSVG(c);
    default: return '';
  }
}
