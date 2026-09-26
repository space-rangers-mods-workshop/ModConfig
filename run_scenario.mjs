#!/usr/bin/env node
// Deterministic run of the "settings screen" scenario (workshop/ModConfig/path_settings.md):
//   1. kill Rangers.exe   2. start it   3. wait for the menu
//   4. click OPTIONS     5. save the settings screen to ethalon_clear.png
//
// Key points learned the hard way:
//   * computer-use coordinates are pixels in the GAME WINDOW frame (the SDK's screenshot), not the
//     desktop. The window is 1280x1032, the SDK frame 1278x1030, so desktop coordinates miss badly.
//   * OPTIONS is the 3rd of 7 menu buttons: centred at (0.504 * W, 0.278 * H) of that frame.
//
// Usage:  node workshop/ModConfig/run_scenario.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe'; // the SDK's id (junction target)
const OUT = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\ethalon_clear.png';

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 15_000;
const AFTER_CLICK_MS = 4_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[scenario]', ...a);

function tryRun(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  log('1/5 kill Rangers.exe');
  tryRun('taskkill', ['/F', '/IM', 'Rangers.exe']);
  await sleep(AFTER_KILL_MS);

  log('2/5 start Rangers.exe');
  if (!tryRun('cmd', ['/c', 'start', '', '/D', GAME_DIR, 'Rangers.exe'])) {
    throw new Error('failed to start ' + GAME_DIR + '\\Rangers.exe');
  }

  log('3/5 wait', BOOT_WAIT_MS, 'ms for the menu');
  await sleep(BOOT_WAIT_MS);

  const { ComputerUse } = await import(SDK_URL);
  const computer = await ComputerUse.create();
  const app = await computer.getApp(APP_ID);

  let s = await app.getState({ includeScreenshot: true });
  let buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  const W = buf.readUInt32BE(16);
  const H = buf.readUInt32BE(20);
  log('frame', W + 'x' + H, 'window=' + s.window);

  const x = Math.round(W * 0.704);
  const y = Math.round(H * 0.512);
  log('4/5 click OPTIONS at', x + ',' + y);
  await app.click({ x, y });
  await sleep(AFTER_CLICK_MS);

  s = await app.getState({ includeScreenshot: true });
  buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  fs.writeFileSync(OUT, buf);
  log('5/5 saved', OUT, '(' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20) + ')');

  await computer.close();
}

main().catch((e) => {
  console.error('[scenario] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
