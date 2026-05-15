#!/usr/bin/env python3
import json
import os
import re
import sys


def to_bool(value):
    return str(value).lower() == "true"


def split_lines(name):
    value = os.environ.get(name, "")
    return [line for line in value.splitlines() if line]


def parse_status_lines(name):
    result = {}
    for line in split_lines(name):
        key, _, value = line.partition("=")
        if key:
            result[key] = value
    return result


def parse_json_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {"status": "block", "blocking": True, "reason": "malformed_code_review_graph_decision"}
    return parsed if isinstance(parsed, dict) else {}


def parse_scorecard(path):
    result = {
        "detected": False,
        "path": path,
        "current": 0,
        "target": 100,
        "unmetChecklistItems": 0,
        "blockingDefects": 0,
        "verdict": "missing",
        "rows": [],
    }
    if not path or not os.path.exists(path):
        return result

    result["detected"] = True
    in_table = False
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle.read().splitlines():
            line = raw_line.strip()
            if line == "## Objective Checklist":
                in_table = True
                continue
            if in_table and line.startswith("## "):
                in_table = False
            if in_table and line.startswith("|") and not line.startswith("| ID ") and not line.startswith("|----"):
                parts = [part.strip() for part in line.strip("|").split("|")]
                if len(parts) >= 6:
                    row_id, category, weight_raw, status, evidence, notes = parts[:6]
                    try:
                        weight = int(weight_raw)
                    except ValueError:
                        weight = 0
                    normalized_status = status.lower().replace(" ", "_")
                    pass_statuses = {"pass", "passed", "done", "full"}
                    fail_statuses = {"fail", "failed", "blocked", "no"}
                    result["rows"].append(
                        {
                            "id": row_id,
                            "category": category,
                            "weight": weight,
                            "status": normalized_status,
                            "evidence": evidence,
                            "notes": notes,
                        }
                    )
                    if normalized_status in pass_statuses:
                        result["current"] += weight
                    else:
                        result["unmetChecklistItems"] += 1
                        if normalized_status in fail_statuses:
                            result["blockingDefects"] += 1
                continue

            match = re.match(r"^- Target score:\s*([0-9]+)\s*$", line)
            if match:
                result["target"] = int(match.group(1))

    if result["detected"]:
        if result["current"] >= result["target"] and result["unmetChecklistItems"] == 0 and result["blockingDefects"] == 0:
            result["verdict"] = "done"
        elif result["blockingDefects"] > 0:
            result["verdict"] = "blocked"
        else:
            result["verdict"] = "retry"

    return result


payload = {
    "runId": os.environ["RUN_ID"],
    "script": "verify-changes.sh",
    "feature": os.environ["FEATURE_NAME"],
    "operatingMode": os.environ["OPERATING_MODE"],
    "startedAt": os.environ["STARTED_AT"],
    "finishedAt": os.environ["FINISHED_AT"],
    "durationMs": int(os.environ["DURATION_MS"]),
    "verdict": os.environ["VERDICT"],
    "exitCode": int(os.environ["EXIT_CODE"]),
    "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
    "evidenceFresh": to_bool(os.environ["EVIDENCE_FRESH_VALUE"]),
    "changedFiles": split_lines("CHANGED_FILES_LINES"),
    "checks": {
        "typecheck": os.environ["TS_STATUS_VALUE"],
        "build": os.environ["BUILD_STATUS_VALUE"],
        "test": os.environ["TEST_STATUS_VALUE"],
        "lint": os.environ["LINT_STATUS_VALUE"],
        "extraChecks": os.environ["EXTRA_STATUS_VALUE"],
        "testEnvironmentDetected": to_bool(os.environ["TEST_ENV_DETECTED_VALUE"]),
        "contractChecks": parse_status_lines("CONTRACT_CHECK_RESULTS_VALUE"),
    },
    "requiredChecks": {
        "declared": split_lines("REQUIRED_DECLARED_LINES"),
        "executed": split_lines("REQUIRED_EXECUTED_LINES"),
        "missing": split_lines("REQUIRED_MISSING_LINES"),
    },
    "optionalChecks": {
        "declared": split_lines("OPTIONAL_DECLARED_LINES"),
        "executed": split_lines("OPTIONAL_EXECUTED_LINES"),
        "failed": split_lines("OPTIONAL_FAILED_LINES"),
    },
    "contract": {
        "path": os.environ["CONTRACT_FILE_PATH"],
        "detected": to_bool(os.environ["CONTRACT_DETECTED_VALUE"]),
        "applicable": to_bool(os.environ["CONTRACT_APPLICABLE_VALUE"]),
        "scopeMatched": to_bool(os.environ["CONTRACT_SCOPE_MATCHED_VALUE"]),
        "scopeReason": os.environ["CONTRACT_SCOPE_REASON_VALUE"],
        "verificationMode": os.environ["VERIFICATION_MODE_VALUE"],
        "fallbackOutsideScope": to_bool(os.environ["CONTRACT_FALLBACK_OUTSIDE_SCOPE_VALUE"]),
        "extraChecksCommand": os.environ["EXTRA_HOOK_VALUE"],
    },
    "artifacts": {
        "resultsFile": os.environ["RESULTS_FILE_PATH"],
        "verdictFile": os.environ["VERDICT_FILE_PATH"],
        "fresh": True,
    },
    "workflowEvidence": {
        "path": os.environ["ANALYSIS_CONTEXT_FILE_VALUE"],
        "detected": to_bool(os.environ["WORKFLOW_EVIDENCE_DETECTED_VALUE"]),
        "mode": os.environ["WORKFLOW_EVIDENCE_MODE_VALUE"],
        "selectedBundles": split_lines("WORKFLOW_SELECTED_BUNDLES_LINES"),
        "requiredSkills": split_lines("WORKFLOW_REQUIRED_SKILLS_LINES"),
        "stageOrder": split_lines("WORKFLOW_STAGE_ORDER_LINES"),
        "appliedSkills": split_lines("WORKFLOW_APPLIED_SKILLS_LINES"),
        "skippedSkills": split_lines("WORKFLOW_SKIPPED_SKILLS_LINES"),
        "selectedHarnessComponents": split_lines("WORKFLOW_SELECTED_HARNESS_COMPONENTS_LINES"),
        "skippedHarnessComponents": split_lines("WORKFLOW_SKIPPED_HARNESS_COMPONENTS_LINES"),
        "selectionReason": os.environ["WORKFLOW_SELECTION_REASON_VALUE"],
        "runtimeIsolation": os.environ["WORKFLOW_RUNTIME_ISOLATION_VALUE"],
        "modelEffortProfile": os.environ["WORKFLOW_MODEL_EFFORT_PROFILE_VALUE"],
        "effortEscalationReason": os.environ["WORKFLOW_EFFORT_ESCALATION_REASON_VALUE"],
        "retrievalBudget": os.environ["WORKFLOW_RETRIEVAL_BUDGET_VALUE"],
        "validationProfile": os.environ["WORKFLOW_VALIDATION_PROFILE_VALUE"],
        "phaseReplayPolicy": os.environ["WORKFLOW_PHASE_REPLAY_POLICY_VALUE"],
        "warnings": split_lines("WORKFLOW_EVIDENCE_WARNINGS_VALUE"),
    },
    "score": parse_scorecard(os.environ.get("HARNESS_SCORECARD_FILE", "")),
}

code_review_graph_decision = parse_json_env("CODE_REVIEW_GRAPH_DECISION_JSON")
if code_review_graph_decision:
    payload["codeReviewGraphDecision"] = code_review_graph_decision

json.dump(payload, sys.stdout, indent=2)
sys.stdout.write("\n")
