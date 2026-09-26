#!/usr/bin/env node
// Slider scenario: open the ModConfig form and exercise one BALANCE row's slider — the `-` and
// `+` buttons, and a click on the strip itself, which must set the value for that position.
//
// Coordinates are pixels inside the game window frame; the panel is centred by PosAutoCorrection
// at (188,200), so with row k at panel-local y = 95 + 40*(k-1):
//   `-`   panel-local (605, y)  -> screen x 793
//   `+`   panel-local (777, y)  -> screen x 965
//   cell c of 12 across the strip: panel-local x 625 + 12c -> screen 813 + 12c
//
// Usage:  node workshop/ModConfig/run_slider.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe';
const MOD_SRC = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\mod';
const MOD_DST = GAME_DIR + '\\Mods\\Miscellaneous\\ModConfig';
const OUT_DIR = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\slider';

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 12_000;
const AFTER_ENTER_MS = 8_000;
const AFTER_CLICK_MS = 900;

const MENU_X = 0.704;
const LOAD_Y = 0.464;
const ICON_X = 0.010;
const ICON_Y = 0.010;
const PANEL_X = 188;
const PANEL_Y = 200;

const rowY = (k) => PANEL_Y + 95 + 52 * (k - 1);          // 38 px row + 14 px separator
const minus = (k) => ({ x: PANEL_X + 605, y: rowY(k) });
const plus = (k) => ({ x: PANEL_X + 777, y: rowY(k) });
const cell = (k, c) => ({ x: PANEL_X + 625 + 6 * c, y: rowY(k) });
// Toggle rows, in panel coordinates: row 8 comes after seven 38 px rows and their separators, so its
// two values sit at panel y 444 and 461.
const enumValue = (panelY) => ({ x: PANEL_X + 340, y: PANEL_Y + panelY + 10 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[slider]', ...a);
const tryRun = (c, a) => {
  try {
    execFileSync(c, a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
// Without the game in the foreground the window stops rendering and synthetic clicks land on
// whatever is on top, so every frame comes out identical.
const focusGame = () =>
  tryRun('powershell', ['-NoProfile', '-Command',
    "(New-Object -ComObject WScript.Shell).AppActivate('Rangers') | Out-Null"]);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log('1/5 kill Rangers.exe');
  tryRun('taskkill', ['/F', '/IM', 'Rangers.exe']);
  await sleep(AFTER_KILL_MS);

  log('2/5 deploy mod -> Mods\\Miscellaneous\\ModConfig');
  tryRun('cmd', ['/c', 'rmdir', '/s', '/q', MOD_DST]);
  if (!tryRun('cmd', ['/c', 'xcopy', MOD_SRC, MOD_DST, '/e', '/i', '/y'])) {
    throw new Error('xcopy failed: ' + MOD_SRC + ' -> ' + MOD_DST);
  }

  log('3/5 start the game, wait', BOOT_WAIT_MS, 'ms');
  if (!tryRun('cmd', ['/c', 'start', '', '/D', GAME_DIR, 'Rangers.exe'])) {
    throw new Error('failed to start Rangers.exe');
  }
  await sleep(BOOT_WAIT_MS);

  const { ComputerUse } = await import(SDK_URL);
  const computer = await ComputerUse.create();
  const app = await computer.getApp(APP_ID);
  let s = await app.getState({ includeScreenshot: true });
  let buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  const W = buf.readUInt32BE(16);
  const H = buf.readUInt32BE(20);
  log('frame', W + 'x' + H);

  const shot = async (name) => {
    s = await app.getState({ includeScreenshot: true });
    buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
    fs.writeFileSync(OUT_DIR + '\\' + name + '.png', buf);
    log('saved', name);
  };
  const clickAt = async (p) => {
    await app.click(p);
    await sleep(AFTER_CLICK_MS);
  };

  log('4/5 click LOAD + Enter (Test Save)');
  await app.click({ x: Math.round(W * MENU_X), y: Math.round(H * LOAD_Y) });
  await sleep(1_500);
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);

  log('5/5 open the form and drive row 5 (CoalAggro) and row 8 (ZeroStartExp)');
  focusGame();
  await app.click({ x: Math.round(W * ICON_X), y: Math.round(H * ICON_Y) });
  await sleep(AFTER_CLICK_MS + 600);
  await shot('0_open');
  focusGame();

  // Click straight on the round blue switch icons — value 0 occupies panel y 444-461, value 1 the
  // 461-478 line — rather than anywhere in the middle of the row.
  const icon = (panelY) => ({ x: PANEL_X + 732, y: PANEL_Y + panelY + 8 });

  // Hard check: click value 0, then close and reopen the form. On reopen AARefresh reads the save
  // again, so the switch state in `reopen_v0` shows whether the click really wrote the byte.
  await clickAt(icon(444));
  await shot('enum_v0');

  await clickAt({ x: 1010, y: 905 });
  await sleep(1500);
  focusGame();
  await clickAt({ x: Math.round(W * ICON_X), y: Math.round(H * ICON_Y) });
  await sleep(2000);
  await shot('reopen_v0');

  await computer.close();
}

main().catch((e) => {
  console.error('[slider] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
