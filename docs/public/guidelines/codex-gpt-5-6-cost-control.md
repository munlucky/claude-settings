# Codex GPT-5.6 Cost Control

This is a Codex/OpenAI adapter policy. It is not a Claude, Qwen, or provider-neutral harness default.

The adapter recommends Luna high for normal work, Luna medium for mechanical work, Luna xhigh for hard reasoning, Terra high only for a declared long-context/state capability, and Sol max only under a bounded approval. Sol ultra is per-request approval only.

`model_auto_compact_token_limit = 240000` is a configured Codex profile setting. It is not evidence that a particular request has already compacted. The 272000 threshold is a billing guard: model switching does not remove the long-context pricing rule.

Hard enforcement is valid only when the token count is runtime-authoritative and the host exposes a supported request interception surface. Approximate, caller-supplied, or unknown estimates produce advisory warnings only.

Phase 01 selects the `model.routing.advised` event as the single diagnostic evidence seam. Routing evidence must not mark a task complete, promote a phase, replace verification, or mutate `C:\Users\moon\.codex\config.toml` without the separate protected-config approval.

The 220000 value is calibration headroom, not a fixed universal threshold. Set it only after measuring estimator underestimate error and output/tool reserve on a representative local corpus.
