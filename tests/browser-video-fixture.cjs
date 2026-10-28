const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

module.exports = function createBrowserVideoFixture(directory) {
  const file = path.join(directory, 'fixture.mp4');
  // Browser-recorded WebM has no finite duration header in CI Chromium.
  // Use a finalized source file, as returned by the video providers, while
  // continuing to exercise the real browser encoder for the exported result.
  const result = spawnSync(process.env.REEL_FFMPEG || 'ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x1240aa:s=360x640:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    '-movflags', '+faststart', file,
  ], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return file;
};
