/**
 * Single RTSP → HLS transcoder for restaurant id=1.
 * Requires ffmpeg on PATH.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'tmp', 'hls', 'restaurant-1');

let ffmpegProc = null;
let currentRtsp = null;

function ensureDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

/** Redact credentials for logging */
function maskRtsp(url) {
  if (!url) return '';
  try {
    const normalized = url.replace(/^rtsp:/i, 'http:');
    const u = new URL(normalized);
    return `rtsp://${u.hostname}:${u.port || '554'}/…`;
  } catch {
    return '(invalid)';
  }
}

function stop() {
  if (ffmpegProc) {
    try {
      ffmpegProc.kill('SIGTERM');
    } catch (_) {}
    ffmpegProc = null;
  }
  currentRtsp = null;
}

/**
 * Start or keep ffmpeg pulling RTSP into OUT_DIR/index.m3u8.
 * @param {string} rtspUrl
 * @returns {string} output directory
 */
function ensureRunning(rtspUrl) {
  const url = String(rtspUrl || '').trim();
  if (!url.toLowerCase().startsWith('rtsp://')) {
    const err = new Error('No valid RTSP URL configured');
    err.code = 'NO_RTSP';
    throw err;
  }

  ensureDir();

  if (ffmpegProc && currentRtsp === url) {
    return OUT_DIR;
  }

  stop();
  currentRtsp = url;

  const indexPath = path.join(OUT_DIR, 'index.m3u8');
  const segPath = path.join(OUT_DIR, 'seg_%03d.ts');

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-i', url,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+append_list+omit_endlist',
    '-hls_segment_filename', segPath,
    indexPath,
  ];

  ffmpegProc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  ffmpegProc.stderr.on('data', () => {});
  ffmpegProc.on('exit', () => {
    ffmpegProc = null;
    currentRtsp = null;
  });

  return OUT_DIR;
}

function getStatus() {
  return { running: !!ffmpegProc, rtspMasked: maskRtsp(currentRtsp) };
}

function getOutputDir() {
  return OUT_DIR;
}

process.on('exit', () => {
  if (ffmpegProc) try { ffmpegProc.kill('SIGKILL'); } catch (_) {}
});

module.exports = {
  ensureRunning,
  stop,
  getStatus,
  getOutputDir,
  maskRtsp,
};
