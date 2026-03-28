#!/usr/bin/env python3
import argparse
import re
from pathlib import Path


PRESETS = {
    "generic": {
        "label": "Generic balanced",
        "weights": {"REQ": 40, "SCN": 30, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "REQ": "In-scope requirements covered",
            "SCN": "Critical scenarios evidenced",
            "VER": "Required verification commands passed",
            "CLOSE": "Review and finish closeout recorded",
        },
    },
    "saas": {
        "label": "SaaS / product flow",
        "weights": {"REQ": 35, "SCN": 35, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "REQ": "In-scope product requirements covered",
            "SCN": "Critical user journeys evidenced",
            "VER": "Required verification commands passed",
            "CLOSE": "Review and finish closeout recorded",
        },
    },
    "api-backend": {
        "label": "API / backend",
        "weights": {"REQ": 40, "SCN": 20, "VER": 30, "CLOSE": 10},
        "descriptions": {
            "REQ": "In-scope contracts and business rules covered",
            "SCN": "Critical request, response, and failure scenarios evidenced",
            "VER": "Required automated verification passed",
            "CLOSE": "Review, migration notes, and handoff recorded",
        },
    },
    "frontend": {
        "label": "Frontend / UI",
        "weights": {"REQ": 30, "SCN": 40, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "REQ": "In-scope UI requirements covered",
            "SCN": "Critical user flows and states evidenced",
            "VER": "Required automated verification passed",
            "CLOSE": "Review, polish, and handoff recorded",
        },
    },
    "platform": {
        "label": "Platform / infra / refactor",
        "weights": {"REQ": 25, "SCN": 10, "VER": 45, "CLOSE": 20},
        "descriptions": {
            "REQ": "In-scope platform or infrastructure changes covered",
            "SCN": "Critical rollout, rollback, and failure scenarios evidenced",
            "VER": "Required verification and operational checks passed",
            "CLOSE": "Runbook, risk notes, and handoff recorded",
        },
    },
}

PROFILE_KEYWORDS = {
    "frontend": [
        "frontend",
        "ui",
        "ux",
        "screen",
        "page",
        "component",
        "layout",
        "responsive",
        "css",
        "design",
        "browser",
        "playwright",
    ],
    "api-backend": [
        "api",
        "backend",
        "endpoint",
        "service",
        "handler",
        "contract",
        "schema",
        "server",
        "webhook",
        "database",
        "query",
    ],
    "platform": [
        "platform",
        "infra",
        "infrastructure",
        "deploy",
        "pipeline",
        "runtime",
        "migration",
        "refactor",
        "ci",
        "cd",
        "worker",
        "observability",
        "rollout",
        "rollback",
    ],
    "saas": [
        "billing",
        "checkout",
        "dashboard",
        "workspace",
        "tenant",
        "subscription",
        "customer",
        "admin",
        "onboarding",
        "product",
    ],
}


def read_text(path_str):
    if not path_str:
        return ""
    path = Path(path_str)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def count_ids(text, prefix):
    return len(set(re.findall(rf"\b{prefix}-[A-Z0-9][A-Z0-9-]*\b", text)))


def detect_profile(explicit_profile, phase_title, phase_doc_path):
    if explicit_profile and explicit_profile != "auto":
        return explicit_profile, f"explicit:{explicit_profile}"

    haystack = f"{phase_title}\n{read_text(phase_doc_path)}".lower()
    scores = {name: 0 for name in PROFILE_KEYWORDS}
    for profile, keywords in PROFILE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in haystack:
                scores[profile] += 1

    best_profile = max(scores, key=scores.get)
    if scores[best_profile] > 0:
        return best_profile, f"auto:keywords:{best_profile}"
    return "generic", "auto:generic"


def round_to_five(value):
    return int(round(value / 5.0) * 5)


def rebalance_weights(base_req, base_scn, req_count, scn_count):
    if req_count == 0 and scn_count == 0:
        return base_req, base_scn, "counts:absent"

    coverage_total = base_req + base_scn
    ratio = (req_count + 1) / (req_count + scn_count + 2)
    proposed_req = round_to_five(coverage_total * ratio)

    min_req = max(10, base_req - 10)
    max_req = min(coverage_total - 10, base_req + 10)
    req_weight = max(min_req, min(max_req, proposed_req))
    scn_weight = coverage_total - req_weight
    return req_weight, scn_weight, f"counts:req={req_count},scn={scn_count}"


def build_markdown(args):
    profile, profile_reason = detect_profile(args.profile, args.phase_title, args.phase_doc)
    preset = PRESETS[profile]

    req_text = read_text(args.requirements_file)
    scn_text = read_text(args.scenario_file)
    req_count = count_ids(req_text, "REQ")
    scn_count = count_ids(scn_text, "SCN")

    req_weight, scn_weight, rebalance_reason = rebalance_weights(
        preset["weights"]["REQ"],
        preset["weights"]["SCN"],
        req_count,
        scn_count,
    )

    rows = [
        ("OBJ-REQ", preset["descriptions"]["REQ"], req_weight, "pending", args.qa_report, f"REQ-* coverage; detected={req_count}"),
        ("OBJ-SCN", preset["descriptions"]["SCN"], scn_weight, "pending", args.qa_report, f"SCN-* coverage; detected={scn_count}"),
        ("OBJ-VER", preset["descriptions"]["VER"], preset["weights"]["VER"], "pending", args.qa_report, "Fresh contract-backed evidence"),
        ("OBJ-CLOSE", preset["descriptions"]["CLOSE"], preset["weights"]["CLOSE"], "pending", args.qa_report, "Review + finish evidence present"),
    ]

    lines = [
        f"# Phase {args.phase_prefix} Scorecard",
        "",
        f"> Objective completion score for phase {args.phase_prefix}. Update after every meaningful implementation or verification round.",
        f"> Preset profile: {profile} ({preset['label']})",
        f"> Profile selection: {profile_reason}",
        f"> Coverage rebalance: {rebalance_reason}",
        "",
        "## Objective Checklist",
        "| ID | Category | Weight | Status | Evidence | Notes |",
        "|----|----------|--------|--------|----------|-------|",
    ]

    for row_id, category, weight, status, evidence, notes in rows:
        lines.append(f"| {row_id} | {category} | {weight} | {status} | {evidence} | {notes} |")

    lines.extend(
        [
            "",
            "## Score Summary",
            "- Current score: 0",
            f"- Target score: {args.target_score}",
            f"- Unmet checklist items: {len(rows)}",
            "- Blocking defects: 0",
            "- Verdict: retry",
            "",
            "## Loop Policy",
            "- `done` requires Current score >= Target score",
            "- `done` requires Unmet checklist items = 0",
            "- `done` requires Blocking defects = 0",
            "- `blocked` means environment, contract, or dependency prevents progress",
            "- `retry` means continue the active phase only",
        ]
    )
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase-prefix", required=True)
    parser.add_argument("--phase-title", required=True)
    parser.add_argument("--target-score", type=int, required=True)
    parser.add_argument("--qa-report", required=True)
    parser.add_argument("--profile", default="auto")
    parser.add_argument("--phase-doc", default="")
    parser.add_argument("--requirements-file", default="")
    parser.add_argument("--scenario-file", default="")
    args = parser.parse_args()
    print(build_markdown(args), end="")


if __name__ == "__main__":
    main()
