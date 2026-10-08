#!/usr/bin/env node
/**
 * Loudness pass for social video: two-pass EBU R128 normalisation to
 * -14 LUFS integrated / -1 dBTP with a linear gain (no squashing). The
 * picture is copied untouched. Uses Remotion's bundled ffmpeg, so there is
 * nothing else to install.
 *
 *   node scripts/finalize.mjs out/olmene-tiktok-raw.mp4 renders/olmene-tiktok.mp4
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: node scripts/finalize.mjs <input.mp4> <output.mp4>");
  process.exit(1);
}

const TARGET = "I=-14:TP=-1:LRA=11";
const ffmpeg = (args) => {
  const r = spawnSync("npx", ["remotion", "ffmpeg", "-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stderr;
};

// Measurement pass: audio only (the bundled ffmpeg has no encoder for null video).
const log = ffmpeg(["-i", input, "-vn", "-af", `loudnorm=${TARGET}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
console.log(`measured ${m.input_i} LUFS, ${m.input_tp} dBTP → -14 LUFS`);

mkdirSync(dirname(output), { recursive: true });
ffmpeg([
  "-y",
  "-i",
  input,
  "-af",
  `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "320k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  output,
]);
console.log(`wrote ${output}`);
