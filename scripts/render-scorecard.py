#!/usr/bin/env python3
import argparse
import re
from pathlib import Path


PRESETS = {
    "generic": {
        "label": "Generic balanced",
        "weights": {"CONFORM": 20, "REQ": 25, "SCN": 25, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "CONFORM": "Source phase plan conformance verified",
            "REQ": "In-scope requirements covered",
            "SCN": "Critical scenarios evidenced",
            "VER": "Required verification commands passed",
            "CLOSE": "Review, finish closeout, and workflow-surface consistency recorded",
        },
    },
    "saas": {
        "label": "SaaS / product flow",
        "weights": {"CONFORM": 20, "REQ": 25, "SCN": 25, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "CONFORM": "Source product phase plan conformance verified",
            "REQ": "In-scope product requirements covered",
            "SCN": "Critical user journeys evidenced",
            "VER": "Required verification commands passed",
            "CLOSE": "Review, finish closeout, and workflow-surface consistency recorded",
        },
    },
    "api-backend": {
        "label": "API / backend",
        "weights": {"CONFORM": 20, "REQ": 25, "SCN": 15, "VER": 30, "CLOSE": 10},
        "descriptions": {
            "CONFORM": "Source API/backend phase plan conformance verified",
            "REQ": "In-scope contracts and business rules covered",
            "SCN": "Critical request, response, and failure scenarios evidenced",
            "VER": "Required automated verification passed",
            "CLOSE": "Review, migration notes, and handoff recorded",
        },
    },
    "frontend": {
        "label": "Frontend / UI",
        "weights": {"CONFORM": 20, "REQ": 20, "SCN": 30, "VER": 20, "CLOSE": 10},
        "descriptions": {
            "CONFORM": "Source UI phase plan conformance verified",
            "REQ": "In-scope UI requirements covered",
            "SCN": "Critical user flows and states evidenced",
            "VER": "Required automated verification passed",
            "CLOSE": "Review, polish, and handoff recorded",
        },
    },
    "demo_first": {
        "label": "Demo-first MVP",
        "weights": {"CONFORM": 20, "REQ": 15, "SCN": 30, "VER": 20, "CLOSE": 15},
        "descriptions": {
            "CONFORM": "Source demo-first phase plan conformance verified",
            "REQ": "In-scope MVP maturity requirements covered",
            "SCN": "User-visible demo flow and state scenarios evidenced",
            "VER": "Required verification and demo evidence checks passed",
            "CLOSE": "Review, demo gate, and finish closeout recorded",
        },
    },
    "platform": {
        "label": "Platform / infra / refactor",
        "weights": {"CONFORM": 20, "REQ": 15, "SCN": 10, "VER": 40, "CLOSE": 15},
        "descriptions": {
            "CONFORM": "Source platform phase plan conformance verified",
            "REQ": "In-scope platform or infrastructure changes covered",
            "SCN": "Critical rollout, rollback, and failure scenarios evidenced",
            "VER": "Required verification and operational checks passed",
            "CLOSE": "Runbook, risk notes, and handoff recorded",
        },
    },
}

PROFILE_KEYWORDS = {
    "demo_first": [
        "demo_first",
        "demo-first",
        "mock functional demo",
        "user demo approval",
        "demo evidence",
        "mvp methodology",
        "mock api contract",
        "user_demo_approval",
    ],
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

PROFILE_ALIASES = {
    "demo": "demo_first",
    "demo-first": "demo_first",
    "demo_first": "demo_first",
    "mvp": "demo_first",
    "mvp-demo": "demo_first",
    "mvp_demo": "demo_first",
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
        normalized = PROFILE_ALIASES.get(explicit_profile, explicit_profile)
        return normalized, f"explicit:{explicit_profile}"

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


def demo_first_rows(args):
    return [
        ("OBJ-DEMO-FLOW", "Clickable demo routes, primary CTA, and core flow are evidenced", 0, "pending", args.qa_report, "Required for demo_first maturity gates"),
        ("OBJ-DEMO-STATE", "Required loading, empty, error, and success states are evidenced", 0, "pending", args.qa_report, "Required before demo approval"),
        ("OBJ-MOCK", "Mock success and error paths are evidenced", 0, "pending", args.qa_report, "Required for Mock Functional Demo"),
        ("OBJ-CONTRACT", "Mock API contract and real API response shape remain compatible", 0, "pending", args.qa_report, "Required for Real Functional"),
        ("OBJ-USER-APPROVAL", "User demo approval has approved non-empty scope", 0, "pending", "docs/implementation/USER_DEMO_APPROVAL.md", "Hard stop before Real Functional"),
        ("OBJ-REAL", "Real API/persistence evidence replaces mock-only behavior", 0, "pending", args.qa_report, "Required for Real Functional"),
    ]


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
        ("OBJ-CONFORM", preset["descriptions"]["CONFORM"], preset["weights"]["CONFORM"], "pending", args.qa_report, "Source plan snapshot, exact targets, and approved deviations"),
        ("OBJ-REQ", preset["descriptions"]["REQ"], req_weight, "pending", args.qa_report, f"REQ-* coverage; detected={req_count}"),
        ("OBJ-SCN", preset["descriptions"]["SCN"], scn_weight, "pending", args.qa_report, f"SCN-* coverage; detected={scn_count}"),
        ("OBJ-VER", preset["descriptions"]["VER"], preset["weights"]["VER"], "pending", args.qa_report, "Fresh contract-backed evidence"),
        ("OBJ-CLOSE", preset["descriptions"]["CLOSE"], preset["weights"]["CLOSE"], "pending", args.qa_report, "Review + finish evidence present"),
    ]
    if profile == "demo_first":
        rows.extend(demo_first_rows(args))

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
            "## Task-Level Status Adapter",
            "- Status: FULL | PARTIAL | NO",
            "- Current task status: NO",
            f"- Partial threshold: {args.partial_threshold}",
            "",
            "| Status | Rule |",
            "|--------|------|",
            "| FULL | Target score met, unmet checklist items = 0, blocking defects = 0, and required verification evidence exists |",
            "| PARTIAL | Core build/verification is preserved, but some REQ/SCN/UAT coverage remains incomplete |",
            "| NO | Blocking defect, verification hard gate failure, critical regression, or score below partial threshold |",
            "",
            "Mapping note:",
            "- This borrows SWE-bench's fail-to-pass / pass-to-pass completion vocabulary conceptually.",
            "- It does not import SWE-bench runtime code.",
            "- Completion gate requires `Current task status: FULL`; `PARTIAL` and `NO` block clean finish.",
            "",
            "## Loop Policy",
            "- `done` requires Current score >= Target score",
            "- `done` requires OBJ-CONFORM = pass",
            "- `done` requires all demo-first MVP objectives to be pass when profile is `demo_first`",
            "- `done` requires Unmet checklist items = 0",
            "- `done` requires Blocking defects = 0",
            "- `done` is blocked when environmentBlockers are recorded or normalizedRunVerdict is `complete_with_environment_blocker`",
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
    parser.add_argument("--partial-threshold", type=int, default=60)
    args = parser.parse_args()
    print(build_markdown(args), end="")


if __name__ == "__main__":
    main()
