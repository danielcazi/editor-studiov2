// What differs per operating system: interpreter names and where Chrome and After Effects live.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const WIN = process.platform === 'win32';
// Windows has no `python3` (the one on PATH is the Microsoft Store stub, which opens the store).
export const PYTHON = process.env.PYTHON ?? (WIN ? 'python' : 'python3');

// npm and npx are .cmd files on Windows, which Node refuses to spawn without a shell (CVE-2024-27980), and a shell would
// need quoting of every path: run their JS entry points with this node instead.
// shortcut: expects npm beside node.exe (official installer, nvm-windows, fnm), upgrade to shell:true + quoting if a Windows Node lacks it
const npmBin = (name: string): string[] => {
  if (!WIN) return [name];
  const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`);
  return existsSync(cli) ? [process.execPath, cli] : [`${name}.cmd`];
};
export const NPX = npmBin('npx'), NPM = npmBin('npm');

const PF = process.env.ProgramFiles ?? 'C:\\Program Files', PF86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', LAD = process.env.LOCALAPPDATA ?? '';
export const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  join(PF, 'Google/Chrome/Application/chrome.exe'), join(PF86, 'Google/Chrome/Application/chrome.exe'), join(LAD, 'Google/Chrome/Application/chrome.exe'),
  join(PF86, 'Microsoft/Edge/Application/msedge.exe'), join(PF, 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];
export const findChrome = () => CHROME_CANDIDATES.find(p => p && existsSync(p));

// The command that makes After Effects run a .jsx: [command, ...args], or null where no After Effects can be driven.
export function afterEffectsCmd(jsx: string): string[] | null {
  const years = ['2026', '2025', '2024'];
  if (process.platform === 'darwin') {
    const app = years.map(y => `Adobe After Effects ${y}`).find(a => existsSync(`/Applications/${a}`)) ?? 'Adobe After Effects';
    return ['osascript', '-e', `tell application "${app}" to DoScriptFile "${jsx}"`];
  }
  if (WIN) {
    const exe = years.map(y => join(PF, `Adobe/Adobe After Effects ${y}/Support Files/AfterFX.exe`)).find(p => existsSync(p));
    return exe ? [exe, '-r', jsx] : null;
  }
  return null;
}
