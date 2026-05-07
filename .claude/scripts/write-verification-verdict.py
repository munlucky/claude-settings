#!/usr/bin/env python3
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone


def parse_command(value: str) -> dict:
    parts = value.split("|", 2)
    if len(parts) == 3:
        name, run, status = (part.strip() for part in parts)
        if not name or not run or not status:
            raise argparse.ArgumentTypeError(
                "command entries must include non-empty name, run, and status"
            )
        return {"name": name, "run": run, "status": status}

    run = value.strip()
    if not run:
        raise argparse.ArgumentTypeError(
            "command entries must be formatted as 'name|run|status' or a non-empty command"
        )
    inferred_name = (
        run.split()[0]
        .replace(".", "_")
        .replace("/", "_")
        .replace("-", "_")
    )
    if not inferred_name:
        inferred_name = "command"
    status = "passed"
    name = inferred_name
    return {"name": name, "run": run, "status": status}


def stable_fingerprint(value) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


def compute_git_tree_fingerprint(root: str) -> str:
    candidate = (root or "").strip() or "."
    try:
        result = subprocess.run(
            ["git", "-C", candidate, "rev-parse", "HEAD^{tree}"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return ""

    return result.stdout.strip()


def infer_blocker_class(reason_code: str, failure_class: str, blocking: bool, verdict: str, missing_checks = None) -> str:
    reason = (reason_code or "").strip().lower()
    failure = (failure_class or "").strip().lower()
    missing_count = len(missing_checks or [])
    if "missing_verification_evidence" in reason or "missing-verification-evidence" in reason or (missing_count > 0 and (blocking or verdict == "failed" or failure in {"contract", "content_precondition"})):
        return "missing_evidence"
    if "content_precondition" in reason or "precondition" in reason or failure == "contract":
        return "content_precondition"
    if "runtime_verifier" in reason or "verifier_unavailable" in reason or "verification_runtime" in reason:
        return "verifier_unavailable"
    if any(token in reason for token in ["auth", "login", "credential", "worker_spawn", "spawn", "codex_exec", "runtime_health", "runtime_cli"]):
        return "runtime_unavailable"
    if failure == "environment":
        return "verifier_unavailable"
    if blocking or verdict == "failed":
        return "verification_failed"
    return ""


def infer_verdict_scope(verdict_scope: str, blocker_class: str, reason_code: str) -> str:
    if verdict_scope:
        return verdict_scope
    reason = (reason_code or "").strip().lower()
    if blocker_class == "runtime_unavailable" and "runtime_verifier" not in reason and "verifier_unavailable" not in reason:
        return "runtime"
    return "phase_verification"


def normalize_workflow_list(values: list[str], defaults: list[str], should_expand: bool) -> list[str]:
    ordered = []
    for value in values:
        if value and value not in ordered:
            ordered.append(value)
    if should_expand:
        for value in defaults:
            if value not in ordered:
                ordered.append(value)
    return ordered


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Write a structured verification verdict JSON for a phase attempt."
    )
    parser.add_argument("--output", required=True, help="Output verdict file path")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--phase-number", required=True, type=int)
    parser.add_argument("--phase-title", default="")
    parser.add_argument("--active-phase-doc-path", default="")
    parser.add_argument("--mode", default="direct-phase-attempt-fallback")
    parser.add_argument("--script", default=".claude/scripts/write-verification-verdict.py")
    parser.add_argument("--verification-mode", default="contract")
    parser.add_argument("--contract-applicable", choices=["true", "false"], default="true")
    parser.add_argument("--verdict", choices=["passed", "failed"], default="passed")
    parser.add_argument("--evidence-fresh", choices=["true", "false"], default="true")
    parser.add_argument("--expected-check", action="append", default=[])
    parser.add_argument("--passed-check", action="append", default=[])
    parser.add_argument("--missing-check", action="append", default=[])
    parser.add_argument("--changed-file", action="append", default=[])
    parser.add_argument("--command", action="append", type=parse_command, default=[])
    parser.add_argument("--selected-bundle", action="append", default=[])
    parser.add_argument("--stage", action="append", default=[])
    parser.add_argument("--workflow-warning", action="append", default=[])
    parser.add_argument("--effort-escalation-reason", default="")
    parser.add_argument("--selected-model-provider", default="")
    parser.add_argument("--selected-model", default="")
    parser.add_argument("--selected-model-effort", default="")
    parser.add_argument("--model-selection-reason", default="")
    parser.add_argument("--retrieval-budget", default="")
    parser.add_argument("--validation-profile", default="")
    parser.add_argument("--phase-replay-policy", default="")
    parser.add_argument("--run-lease-id", default="")
    parser.add_argument("--plan-dir", default="")
    parser.add_argument("--status-file", default="")
    parser.add_argument("--git-tree-fingerprint", default="")
    parser.add_argument("--git-tree-root", default="")
    parser.add_argument("--requested-runtime", default="")
    parser.add_argument("--effective-runtime", default="")
    parser.add_argument("--fallback-reason", default="")
    parser.add_argument("--verification-runtime-targets", default="")
    parser.add_argument("--failure-class", choices=["", "implementation", "verification", "environment", "contract"], default="")
    parser.add_argument("--blocking", choices=["true", "false"], default="false")
    parser.add_argument("--blocking-reason-code", default="")
    parser.add_argument("--schema-version", default="3")
    parser.add_argument("--verdict-scope", choices=["", "runtime", "phase_verification", "phase_closeout"], default="")
    parser.add_argument(
        "--blocker-class",
        choices=["", "runtime_unavailable", "verifier_unavailable", "verification_failed", "content_precondition", "missing_evidence", "contract_violation"],
        default="",
    )
    parser.add_argument("--blocker-fingerprint", default="")
    parser.add_argument("--environment-fingerprint", default="")
    parser.add_argument("--artifact-fingerprint", default="")
    parser.add_argument("--supersedes", action="append", default=[])
    parser.add_argument("--superseded-by", default="")
    parser.add_argument("--stale-when", action="append", default=[])
    parser.add_argument("--stale", choices=["true", "false"], default="false")
    parser.add_argument("--score-current", type=int)
    parser.add_argument("--score-target", type=int)
    parser.add_argument("--score-unmet", type=int)
    parser.add_argument("--score-blocking", type=int)
    parser.add_argument("--score-verdict")
    parser.add_argument(
        "--generated-at",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    args = parser.parse_args()

    phase_title = args.phase_title or f"Phase {args.phase_number}"
    active_phase_doc_path = args.active_phase_doc_path or "."

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    score_inputs = (
        args.score_current,
        args.score_target,
        args.score_unmet,
        args.score_blocking,
        args.score_verdict,
    )
    score_provided = any(value is not None for value in score_inputs)

    score_payload = {"detected": False}
    if score_provided:
        inferred_score_verdict = args.score_verdict or (
            "done"
            if args.verdict == "passed"
            and args.evidence_fresh == "true"
            and len(args.missing_check) == 0
            else "retry"
        )
        target_score = args.score_target if args.score_target is not None else 100
        current_score = args.score_current
        if current_score is None:
            current_score = target_score if inferred_score_verdict == "done" else 0

        score_payload = {
            "detected": True,
            "current": current_score,
            "target": target_score,
            "unmetChecklistItems": args.score_unmet if args.score_unmet is not None else 0,
            "unmetItems": args.score_unmet if args.score_unmet is not None else 0,
            "blockingDefects": args.score_blocking if args.score_blocking is not None else 0,
            "verdict": inferred_score_verdict,
        }

    blocking = args.blocking == "true"
    blocker_class = args.blocker_class or infer_blocker_class(
        args.blocking_reason_code,
        args.failure_class,
        blocking,
        args.verdict,
        args.missing_check,
    )
    verdict_scope = infer_verdict_scope(args.verdict_scope, blocker_class, args.blocking_reason_code)
    blocker_fingerprint = args.blocker_fingerprint or stable_fingerprint(
        {
            "phase": args.phase_number,
            "scope": verdict_scope,
            "blockerClass": blocker_class,
            "reason": args.blocking_reason_code,
            "missing": args.missing_check,
        }
    )
    phase_closeout_verdict = args.verification_mode == "phase_closeout"
    selected_bundles = normalize_workflow_list(
        args.selected_bundle,
        [
            "ready-isolate-bundle",
            "implementation-bundle",
            "review-bundle",
            "verification-bundle",
            "finish-bundle",
        ],
        phase_closeout_verdict and args.verdict == "passed" and args.evidence_fresh == "true",
    )
    stage_order = normalize_workflow_list(
        args.stage,
        ["ready/isolate", "execute", "review", "verify", "finish"],
        phase_closeout_verdict and args.verdict == "passed" and args.evidence_fresh == "true",
    )
    workflow_warnings = [] if phase_closeout_verdict and args.verdict == "passed" and args.evidence_fresh == "true" else args.workflow_warning
    environment_fingerprint = args.environment_fingerprint or stable_fingerprint(
        {
            "requestedRuntime": args.requested_runtime,
            "effectiveRuntime": args.effective_runtime,
            "verificationRuntimeTargets": args.verification_runtime_targets,
        }
    )
    artifact_fingerprint = args.artifact_fingerprint or stable_fingerprint(
        {
            "changedFiles": args.changed_file,
            "commands": args.command,
            "expected": args.expected_check,
            "passed": args.passed_check,
            "missing": args.missing_check,
        }
    )

    identity = {}
    if args.run_lease_id:
        identity["runLeaseId"] = args.run_lease_id
    if args.plan_dir:
        identity["planDir"] = args.plan_dir
    if args.status_file:
        identity["statusFile"] = args.status_file

    git_tree_fingerprint = args.git_tree_fingerprint.strip()
    if not git_tree_fingerprint and (args.git_tree_root.strip() or identity):
        git_tree_fingerprint = compute_git_tree_fingerprint(args.git_tree_root or ".")
    if git_tree_fingerprint:
        identity["gitTreeFingerprint"] = git_tree_fingerprint

    payload = {
        "schemaVersion": args.schema_version,
        "script": args.script,
        "runId": args.run_id,
        "phase": {
            "number": args.phase_number,
            "title": phase_title,
            "activePhaseDocPath": active_phase_doc_path,
        },
        "contract": {
            "applicable": args.contract_applicable == "true",
            "verificationMode": args.verification_mode,
        },
        "contractApplicable": args.contract_applicable == "true",
        "verificationMode": args.verification_mode,
        "mode": args.mode,
        "verdict": args.verdict,
        "evidenceFresh": args.evidence_fresh == "true",
        "requiredChecks": {
            "expected": args.expected_check,
            "passed": args.passed_check,
            "missing": args.missing_check,
        },
        "changedFiles": args.changed_file,
        "commands": args.command,
        "workflowEvidence": {
            "selectedBundles": selected_bundles,
            "stageOrder": stage_order,
            "effortEscalationReason": args.effort_escalation_reason,
            "selectedModelProvider": args.selected_model_provider,
            "selectedModel": args.selected_model,
            "selectedModelEffort": args.selected_model_effort,
            "modelSelectionReason": args.model_selection_reason,
            "retrievalBudget": args.retrieval_budget,
            "validationProfile": args.validation_profile,
            "phaseReplayPolicy": args.phase_replay_policy,
            "warnings": workflow_warnings,
        },
        "runtimeContext": {
            "requestedRuntime": args.requested_runtime,
            "effectiveRuntime": args.effective_runtime,
            "fallbackReason": args.fallback_reason,
            "verificationRuntimeTargets": args.verification_runtime_targets,
        },
        **({"identity": identity} if identity else {}),
        "verdictScope": verdict_scope,
        "blockerClass": blocker_class,
        "blockerFingerprint": blocker_fingerprint,
        "environmentFingerprint": environment_fingerprint,
        "artifactFingerprint": artifact_fingerprint,
        "supersedes": args.supersedes,
        "supersededBy": args.superseded_by,
        "staleWhen": args.stale_when,
        "stale": args.stale == "true",
        "failureClass": args.failure_class or "",
        "blocking": blocking,
        "blockingReasonCode": args.blocking_reason_code or "",
        "score": score_payload,
        "generatedAt": args.generated_at,
    }

    output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
