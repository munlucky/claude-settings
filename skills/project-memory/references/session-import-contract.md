# Session Import Contract

Provider adapters discover sessions without assuming a provider's account path. They map by working directory, canonical Git root, remote identity, Kernel project identity, and binding metadata. `matched` sessions may be analyzed; `ambiguous`, `foreign`, and `unresolved` sessions are not automatically imported. Only redacted candidate summaries and source digests leave the provider store.
