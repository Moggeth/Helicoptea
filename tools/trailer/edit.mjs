// Cuts the recorded shots (tools/trailer/shots.mjs) into the trailer with ffmpeg: hard cuts on the picture,
// a few milliseconds of fade on each audio cut (no clicks), then a title card: the last frame of the final
// shot, slowly pushed in, blurred and dimmed, with the Helicoptea logo fading up while the final shot's own
// sound rings out. Loudness is normalised to -16 LUFS. Needs ffmpeg on the PATH.
//   node tools/trailer/edit.mjs [--in=scratch/trailer] [--out=trailer/helicoptea-trailer.mp4]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const inDir = path.resolve(arg('in') || 'scratch/trailer');
const out = path.resolve(arg('out') || 'trailer/helicoptea-trailer.mp4');
const logo = path.resolve('assets/branding/steam/logo.png');
const FPS = 60;

// [shot, first frame, frame count] in running order.
const CUT = [
  ['dip', 20, 120],      // a tea bag lowered into the mug
  ['cockpit', 30, 108],  // from the pilot's seat, out of the back door
  ['reveal2', 36, 120],  // pull back over the gardens and allotments
  ['chinook', 48, 108],  // the Chinook lifts three bags over the camera
  ['snorkel', 0, 90],    // skycrane pumping milk up from the crock
  ['pour', 0, 108],      // and dropping it into the teacup
  ['dunk', 0, 96],       // nose first into the tea
];
const TITLE = 2.5;       // seconds

fs.mkdirSync(path.dirname(out), { recursive: true });
const args = ['-y', '-hide_banner', '-loglevel', 'error'];
const fv = [], fa = [];
CUT.forEach(([name, first, n], i) => {
  args.push('-framerate', String(FPS), '-start_number', String(first), '-i', path.join(inDir, name, 'f%05d.jpg'));
  args.push('-i', path.join(inDir, name, 'audio.wav'));
  const v = i * 2, a = i * 2 + 1, t0 = first / FPS, d = n / FPS;
  fv.push(`[${v}:v]trim=end_frame=${n},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`);
  // The final shot's audio also plays on under the title card.
  const src = i === CUT.length - 1 ? `[${a}:a]asplit[alast][atail];[alast]` : `[${a}:a]`;
  fa.push(`${src}atrim=${t0}:${t0 + d},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${(d - 0.02).toFixed(3)}:d=0.02[a${i}]`);
});
// Title card: the final shot's last used frame, held.
const [lname, lfirst, ln] = CUT[CUT.length - 1];
const li = CUT.length * 2;
args.push('-loop', '1', '-framerate', String(FPS), '-t', String(TITLE), '-i', path.join(inDir, lname, `f${String(lfirst + ln - 1).padStart(5, '0')}.jpg`));
args.push('-loop', '1', '-framerate', String(FPS), '-t', String(TITLE), '-i', logo);
const ltail = (lfirst + ln) / FPS;
const N = Math.round(TITLE * FPS);
fv.push(`[${li}:v]scale=3840:2160,zoompan=z='1+0.06*on/${N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},` +
  `gblur=sigma=14,eq=brightness=-0.12:saturation=0.85,trim=end_frame=${N},setpts=PTS-STARTPTS,format=yuv420p[bg]`);
fv.push(`[${li + 1}:v]scale=1220:-1,format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1,setpts=PTS-STARTPTS[lg]`);
fv.push(`[bg][lg]overlay=x=(W-w)/2:y=(H-h)/2-20:shortest=1,fade=t=in:st=0:d=0.18,fade=t=out:st=${(TITLE - 0.35).toFixed(2)}:d=0.35,format=yuv420p[vt]`);
// Under the title: the final shot's own sound carries on, fading away.
fa.push(`[atail]atrim=${ltail}:${ltail + TITLE},asetpts=PTS-STARTPTS,apad=whole_dur=${TITLE},afade=t=in:d=0.01,afade=t=out:st=0.3:d=${(TITLE - 0.4).toFixed(2)}[at]`);
const nseg = CUT.length + 1;
const cat = CUT.map((_, i) => `[v${i}][a${i}]`).join('') + '[vt][at]';
const filter = [...fv, ...fa, `${cat}concat=n=${nseg}:v=1:a=1[v][acat]`, '[acat]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]'].join(';');
args.push('-filter_complex', filter, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
console.log(`wrote ${out} (${(+dur).toFixed(2)} s)`);
