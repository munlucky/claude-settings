#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


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
    parser.add_argument("--phase-title", required=True)
    parser.add_argument("--active-phase-doc-path", required=True)
    parser.add_argument("--mode", default="direct-phase-attempt-fallback")
    parser.add_argument("--script", default=".claude/scripts/write-verification-verdict.py")
    parser.add_argument("--verification-mode", default="contract")
    parser.add_argument("--contract-applicable", choices=["true", "false"], default="true")
    parser.add_argument("--verdict", choices=["passed", "failed"], required=True)
    parser.add_argument("--evidence-fresh", choices=["true", "false"], default="true")
    parser.add_argument("--expected-check", action="append", default=[])
    parser.add_argument("--passed-check", action="append", default=[])
    parser.add_argument("--missing-check", action="append", default=[])
    parser.add_argument("--changed-file", action="append", default=[])
    parser.add_argument("--command", action="append", type=parse_command, default=[])
    parser.add_argument("--selected-bundle", action="append", default=[])
    parser.add_argument("--stage", action="append", default=[])
    parser.add_argument("--workflow-warning", action="append", default=[])
    parser.add_argument("--score-current", type=int, required=True)
    parser.add_argument("--score-target", type=int, required=True)
    parser.add_argument("--score-unmet", type=int, required=True)
    parser.add_argument("--score-blocking", type=int, required=True)
    parser.add_argument("--score-verdict", required=True)
    parser.add_argument("--generated-at", required=True)
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "script": args.script,
        "runId": args.run_id,
        "phase": {
            "number": args.phase_number,
            "title": args.phase_title,
            "activePhaseDocPath": args.active_phase_doc_path,
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
        "score": {
            "detected": True,
            "current": args.score_current,
            "target": args.score_target,
            "unmetChecklistItems": args.score_unmet,
            "unmetItems": args.score_unmet,
            "blockingDefects": args.score_blocking,
            "verdict": args.score_verdict,
        },
        "generatedAt": args.generated_at,
    }

    output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
