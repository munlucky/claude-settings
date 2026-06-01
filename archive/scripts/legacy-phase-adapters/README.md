# Legacy Phase Adapter Script Archive

This archive preserves the previous delegated-terminal phase runner engine, diagnostics, and script-local tests.

These files are not part of the active runtime package payload. The active `scripts/` directory keeps only installer, MCP, MemoryGraph, commit closeout, and support-library files that `package/build-package.mjs` explicitly copies.

Use archived scripts only for explicit legacy compatibility investigation or repair. Do not add new workflow dependencies on this archive.

Some archived scripts may depend on support libraries that remain active under `scripts/`. Treat this archive as preserved source history, not as a new runtime surface.
