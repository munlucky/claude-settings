#!/usr/bin/env python3
import argparse
import json
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
    parser.add_argument("--requested-runtime", default="")
    parser.add_argument("--effective-runtime", default="")
    parser.add_argument("--verification-runtime-targets", default="")
    parser.add_argument("--failure-class", choices=["", "implementation", "verification", "environment", "contract"], default="")
    parser.add_argument("--blocking", choices=["true", "false"], default="false")
    parser.add_argument("--blocking-reason-code", default="")
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

    payload = {
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
            "selectedBundles": args.selected_bundle,
            "stageOrder": args.stage,
            "warnings": args.workflow_warning,
        },
        "runtimeContext": {
            "requestedRuntime": args.requested_runtime,
            "effectiveRuntime": args.effective_runtime,
            "verificationRuntimeTargets": args.verification_runtime_targets,
        },
        "failureClass": args.failure_class or "",
        "blocking": args.blocking == "true",
        "blockingReasonCode": args.blocking_reason_code or "",
        "score": score_payload,
        "generatedAt": args.generated_at,
    }

    output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
