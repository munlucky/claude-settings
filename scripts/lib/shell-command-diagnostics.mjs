export function diagnoseShellCommand(command, options = {}) {
  const shell = String(options.shell || process.env.SHELL || process.env.ComSpec || '').toLowerCase();
  const text = String(command || '').trim();
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)=('[^']*'|"[^"]*"|[^\s;]+)\s+(.+)$/);
  const isPowerShell = shell.includes('powershell') || shell.includes('pwsh');
  if (isPowerShell && /(?:<<\s*['"]?\w+['"]?|ParserError|Missing file specification after redirection operator|The '<' operator is reserved|Array index expression is missing or not valid|Unexpected token .* in expression or statement)/i.test(text)) {
    return {
      ok: false,
      code: 'powershell_command_syntax',
      message: 'PowerShell does not support POSIX here-doc/parser syntax. Use a PowerShell here-string piped to the command or run the command in Git Bash.',
      example: "@'\nconsole.log('example')\n'@ | node -",
    };
  }
  if (isPowerShell && match) {
    const key = match[1];
    const value = match[2].replace(/^['"]|['"]$/g, '');
    const rest = match[3];
    return {
      ok: false,
      code: 'windows_shell_env_syntax',
      message: `PowerShell does not support POSIX env prefix syntax. Use $env:${key}='${value}'; ${rest}`,
      example: `$env:${key}='${value}'; ${rest}`,
    };
  }
  return { ok: true, code: 'ok', message: '', example: '' };
}
