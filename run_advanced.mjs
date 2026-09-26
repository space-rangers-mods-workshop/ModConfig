// Runner for workshop/ModConfig/path_advanced_ajustment.md:
//   kill Rangers.exe -> start -> wait -> Enter -> Enter -> the advanced-adjustment window is up.
// Usage: node workshop/ModConfig/run_advanced.mjs [outfile]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe';
const MOD_SRC = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\mod';
const MOD_DST = GAME_DIR + '\\Mods\\Miscellaneous\\ModConfig';
const OUT =
  'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\' +
  (process.argv[2] || 'advanced_path.png');

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 10_000;
const AFTER_ENTER_MS = 3_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[advanced]', ...a);
const tryRun = (c, a) => {
  try {
    execFileSync(c, a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

async function main() {
  log('1/5 kill Rangers.exe');
  tryRun('taskkill', ['/F', '/IM', 'Rangers.exe']);
  await sleep(AFTER_KILL_MS);

  log('2/5 deploy mod -> Mods\\Miscellaneous\\ModConfig');
  tryRun('cmd', ['/c', 'rmdir', '/s', '/q', MOD_DST]);
  if (!tryRun('cmd', ['/c', 'xcopy', MOD_SRC, MOD_DST, '/e', '/i', '/y'])) {
    throw new Error('xcopy failed');
  }

  log('3/5 start Rangers.exe, wait', BOOT_WAIT_MS, 'ms');
  if (!tryRun('cmd', ['/c', 'start', '', '/D', GAME_DIR, 'Rangers.exe'])) {
    throw new Error('start failed');
  }
  await sleep(BOOT_WAIT_MS);

  const { ComputerUse } = await import(SDK_URL);
  const computer = await ComputerUse.create();
  const app = await computer.getApp(APP_ID);
  let s = await app.getState({ includeScreenshot: true });
  let buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  log('frame', buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));

  log('4/5 Enter, Enter');
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);

  log('5/5 save', OUT);
  s = await app.getState({ includeScreenshot: true });
  buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  fs.writeFileSync(OUT, buf);
  log('saved', buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));

  await computer.close();
}

main().catch((e) => {
  console.error('[advanced] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
