// Cuts the recorded scenes (record.mjs) into the finished marketing videos, with a short crossfade between scenes
// and a silent soundtrack (add music in TikTok, Instagram or your editor, where the songs are licensed for use).
//   node make-video.mjs   -> out/tcgboogie-vertical.mp4 (1080x1920) and out/tcgboogie-wide.mp4 (1920x1080)
import ffmpegPath from "ffmpeg-static";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FADE = 0.3; // seconds of crossfade between scenes
fs.mkdirSync("out", { recursive: true });

/** A clip's length in seconds, read from ffmpeg's own report. */
function duration(file) {
  const r = spawnSync(ffmpegPath, ["-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || "");
  if (!m) throw new Error(`No duration for ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

for (const format of ["vertical", "wide"]) {
  const dir = path.join("clips", format);
  if (!fs.existsSync(dir)) continue;
  const clips = fs.readdirSync(dir).filter((f) => f.endsWith(".mp4")).sort().map((f) => path.join(dir, f));
  const lengths = clips.map(duration);
  const inputs = clips.flatMap((c) => ["-i", c]);
  // Chain xfade filters: each scene fades into the next, FADE seconds before the previous one ends.
  const parts = [];
  let last = "[0:v]";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += lengths[i - 1] - FADE;
    const out = i === clips.length - 1 ? "[v]" : `[x${i}]`;
    parts.push(`${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${out}`);
    last = out;
  }
  const total = lengths.reduce((a, b) => a + b, 0) - FADE * (clips.length - 1);
  const file = path.join("out", `tcgboogie-${format}.mp4`);
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...inputs,
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex", parts.join(";"), "-map", "[v]", "-map", `${clips.length}:a`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", "-shortest", file]);
  console.log(`${file}: ${total.toFixed(1)}s, ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}
