import { spawnSync, execSync } from 'node:child_process';
import process from 'node:process';

function isWindowsAdmin() {
  if (process.platform !== 'win32') return false;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
if (!args.length) {
  process.exit(0);
}

if (process.platform === 'win32' && !isWindowsAdmin()) {
  const argList = args.map((a) => `'${a}'`).join(', ');
  const psCommand = `$p = Start-Process node -ArgumentList ${argList} -Verb RunAs -Wait -PassThru; if ($p -and $p.ExitCode -ne 0) { Write-Host ''; Write-Host 'Process exited with error code:' $p.ExitCode -ForegroundColor Red; Read-Host 'Press Enter to exit...' }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCommand], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 0);
} else {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}
