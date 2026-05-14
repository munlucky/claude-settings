#!/usr/bin/env python3
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from code_review_graph_evidence import validate_code_review_graph_evidence


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = REPO_ROOT / ".claude" / "scripts" / "lib" / "code-review-graph-fixtures"


def read_fixture(name):
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def write_json(file_path, value):
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    Path(file_path).write_text(json.dumps(value, indent=2), encoding="utf-8")


def digest(file_path):
    return hashlib.sha256(Path(file_path).read_bytes()).hexdigest()


def base_input(**overrides):
    value = {
        "validationProfile": "strict",
        "evidenceCarrier": "phase",
        "changedFiles": {
            "files": ["src/app.js"],
            "source": "verdict_json",
            "baseRef": "HEAD~1",
            "baseRefSource": "explicit",
            "baseRefWarning": None,
            "fallbackUsed": False,
        },
        "selectedHarnessComponents": [],
        "skippedHarnessComponents": [],
        "codeReviewGraph": {
            "crgCliVersion": "test-1",
            "stages": {
                "execute": {"operation": "scan", "exitCode": 0},
                "review": {"operation": "review", "exitCode": 0},
                "finish": {"operation": "publish", "exitCode": 0},
            },
        },
    }
    value.update(overrides)
    return value


class CodeReviewGraphEvidenceTest(unittest.TestCase):
    def test_passes_for_complete_phase_evidence_artifact_inside_allowed_root(self):
        with tempfile.TemporaryDirectory(prefix="crg-python-") as repo_root:
            phase_execution_dir = "execution/phase-03"
            artifact_path = Path(repo_root) / phase_execution_dir / "evidence" / "code-review-graph" / "evidence.json"
            write_json(
                artifact_path,
                {
                    "adapterRunId": "run-1",
                    "crgCliVersion": "test-1",
                    "stages": ["execute", "review", "finish"],
                },
            )

            input_value = base_input(
                codeReviewGraph={
                    **base_input()["codeReviewGraph"],
                    "adapterRunId": "run-1",
                    "evidenceArtifactPath": artifact_path.relative_to(repo_root).as_posix(),
                    "evidenceDigest": digest(artifact_path),
                }
            )
            decision = validate_code_review_graph_evidence(input_value, repo_root, phase_execution_dir)

            self.assertEqual(decision["status"], "pass")
            self.assertEqual(decision["blocking"], False)
            self.assertEqual(decision["reason"], "ok")
            self.assertEqual(decision["normalizedEvidence"]["adapterRunId"], "run-1")

    def test_returns_shared_fixture_pass_decision(self):
        decision = validate_code_review_graph_evidence(
            read_fixture("phase-pass.json"),
            Path.cwd(),
            "execution/phase-03",
        )

        self.assertEqual(decision["status"], "pass")
        self.assertEqual(decision["blocking"], False)
        self.assertEqual(decision["reason"], "ok")

    def test_returns_shared_fixture_blocker_decisions(self):
        missing_stage = validate_code_review_graph_evidence(
            read_fixture("missing-required-stage.json"),
            Path.cwd(),
            "execution/phase-03",
        )
        unresolved = validate_code_review_graph_evidence(
            read_fixture("changed-files-unresolved.json"),
            Path.cwd(),
            "execution/phase-03",
        )

        self.assertEqual(missing_stage["blockerCode"], "missing_required_stage_coverage")
        self.assertEqual(unresolved["blockerCode"], "changed_files_unresolved")

    def test_blocks_code_changing_strict_closeout_when_required_stages_are_missing(self):
        decision = validate_code_review_graph_evidence(
            base_input(
                codeReviewGraph={
                    "crgCliVersion": "test-1",
                    "stages": {
                        "execute": {"operation": "scan", "exitCode": 0},
                    },
                }
            ),
            Path.cwd(),
            "execution/phase-03",
        )

        self.assertEqual(decision["status"], "block")
        self.assertEqual(decision["blockerCode"], "missing_required_stage_coverage")
        self.assertEqual(decision["missingStages"], ["review", "finish"])

    def test_rejects_phase_artifact_path_resolving_outside_allowed_root(self):
        with tempfile.TemporaryDirectory(prefix="crg-python-outside-") as repo_root:
            outside_path = Path(repo_root) / "outside" / "evidence.json"
            write_json(
                outside_path,
                {
                    "adapterRunId": "run-2",
                    "crgCliVersion": "test-1",
                },
            )

            decision = validate_code_review_graph_evidence(
                base_input(
                    codeReviewGraph={
                        **base_input()["codeReviewGraph"],
                        "adapterRunId": "run-2",
                        "evidenceArtifactPath": outside_path.relative_to(repo_root).as_posix(),
                        "evidenceDigest": digest(outside_path),
                    }
                ),
                repo_root,
                "execution/phase-03",
            )

            self.assertEqual(decision["status"], "block")
            self.assertEqual(decision["blockerCode"], "evidence_artifact_outside_allowed_root")

    def test_blocks_strict_profile_when_changed_files_and_base_ref_are_unresolved(self):
        decision = validate_code_review_graph_evidence(
            base_input(
                changedFiles={},
                codeReviewGraph={
                    "crgCliVersion": "test-1",
                },
            ),
            Path.cwd(),
            "execution/phase-03",
        )

        self.assertEqual(decision["status"], "block")
        self.assertEqual(decision["blockerCode"], "changed_files_unresolved")


if __name__ == "__main__":
    unittest.main()
