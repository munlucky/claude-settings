# Staging Policy

Never use `git add -A` or `git add .`. Select paths from porcelain status and deny `.agents`, `.mcp.json`, legacy memory paths, Runtime Home, provider stores, Code Index artifacts, and import receipts before invoking Git.
