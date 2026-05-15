#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path


REQUIRED_STAGES = ["execute", "review", "finish"]
STRICT_PROFILES = {"strict", "workflow_core", "runtime_adapter"}


def empty_decision():
    return {
        "status": "pass",
        "blocking": False,
        "profileAction": "pass",
        "retryable": False,
        "warningCode": None,
        "blockerCode": None,
        "blockerClass": None,
        "reason": "ok",
        "missingStages": [],
        "invalidSkipReason": None,
        "baseRefWarning": None,
        "normalizedEvidence": {},
    }


def blocker(code, reason, **extra):
    decision = empty_decision()
    decision.update(
        {
            "status": "block",
            "blocking": True,
            "profileAction": "block",
            "retryable": False,
            "blockerCode": code,
            "blockerClass": code,
            "reason": reason,
        }
    )
    decision.update(extra)
    return decision


def sha256_file(file_path):
    return hashlib.sha256(Path(file_path).read_bytes()).hexdigest()


def normalize_root(root_path):
    path = Path(root_path).resolve()
    return path


def is_inside_path(child_path, parent_path):
    try:
        Path(child_path).resolve().relative_to(Path(parent_path).resolve())
        return True
    except ValueError:
        return False


def allowed_evidence_root(repo_root, evidence_carrier, phase_execution_dir):
    repo = Path(repo_root or os.getcwd()).resolve()
    if evidence_carrier == "phase":
        if not phase_execution_dir:
            raise ValueError("phaseExecutionDir is required for phase evidence")
        return repo / phase_execution_dir / "evidence" / "code-review-graph"
    if evidence_carrier == "bounded":
        return repo / ".claude" / "logs" / "code-review-graph" / "evidence"
    raise ValueError(f"unsupported evidenceCarrier: {evidence_carrier or '<empty>'}")


def normalize_stages(code_review_graph):
    raw_stages = code_review_graph.get("stages") or code_review_graph.get("stageEvidence") or {}
    if isinstance(raw_stages, list):
        entries = [(stage.get("stage"), stage) for stage in raw_stages if isinstance(stage, dict)]
    else:
        entries = list(raw_stages.items()) if isinstance(raw_stages, dict) else []

    stages = {}
    for raw_name, raw_meta in entries:
        name = str(raw_name or "").strip()
        if not name or not isinstance(raw_meta, dict):
            continue
        try:
            exit_code = int(raw_meta.get("exitCode"))
        except (TypeError, ValueError):
            exit_code = None
        stages[name] = {
            "operation": str(raw_meta.get("operation") or "").strip(),
            "exitCode": exit_code,
        }
    return stages


def resolve_changed_files(input_value):
    changed_files = input_value.get("changedFiles") or {}
    files = changed_files.get("files")
    if isinstance(files, list) and changed_files.get("source"):
        return {
            "files": files,
            "source": changed_files.get("source"),
            "baseRef": changed_files.get("baseRef"),
            "baseRefSource": changed_files.get("baseRefSource"),
            "baseRefWarning": changed_files.get("baseRefWarning"),
            "fallbackUsed": bool(changed_files.get("fallbackUsed")),
        }

    worksets = input_value.get("worksets") or {}
    owned_paths = worksets.get("ownedPaths") or worksets.get("activeOwnedPaths") or []
    if isinstance(owned_paths, list) and owned_paths:
        return {
            "files": owned_paths,
            "source": "worksets_owned_paths",
            "baseRef": changed_files.get("baseRef"),
            "baseRefSource": changed_files.get("baseRefSource"),
            "baseRefWarning": changed_files.get("baseRefWarning"),
            "fallbackUsed": True,
        }

    attempt_manifest = input_value.get("attemptManifest") or {}
    runner_changed_ledger = input_value.get("runnerChangedLedger") or {}
    manifest_files = attempt_manifest.get("changedFiles") or runner_changed_ledger.get("files") or []
    if isinstance(manifest_files, list) and manifest_files:
        return {
            "files": manifest_files,
            "source": "attempt_manifest",
            "baseRef": changed_files.get("baseRef"),
            "baseRefSource": changed_files.get("baseRefSource"),
            "baseRefWarning": changed_files.get("baseRefWarning"),
            "fallbackUsed": True,
        }

    return {
        "files": [],
        "source": changed_files.get("source") or "unresolved",
        "baseRef": changed_files.get("baseRef"),
        "baseRefSource": changed_files.get("baseRefSource"),
        "baseRefWarning": changed_files.get("baseRefWarning"),
        "fallbackUsed": bool(changed_files.get("fallbackUsed")),
    }


def validate_code_review_graph_evidence(input_value, repo_root=None, phase_execution_dir=None):
    decision = empty_decision()
    evidence_carrier = input_value.get("evidenceCarrier") or "bounded"
    validation_profile = input_value.get("validationProfile") or "prompt_only"
    code_review_graph = input_value.get("codeReviewGraph") or {}
    resolved_changed_files = resolve_changed_files(input_value)
    code_changing = len(resolved_changed_files["files"]) > 0
    decision["baseRefWarning"] = resolved_changed_files.get("baseRefWarning")

    if (
        validation_profile in STRICT_PROFILES
        and resolved_changed_files["source"] == "unresolved"
        and not resolved_changed_files.get("baseRef")
    ):
        return blocker(
            "changed_files_unresolved",
            "changedFiles/baseRef could not be resolved",
            baseRefWarning=resolved_changed_files.get("baseRefWarning") or "unresolved",
        )

    stages = normalize_stages(code_review_graph)
    missing_stages = []
    if code_changing:
        for stage in REQUIRED_STAGES:
            meta = stages.get(stage)
            if not meta or not meta.get("operation") or not isinstance(meta.get("exitCode"), int):
                missing_stages.append(stage)
    if missing_stages:
        return blocker(
            "missing_required_stage_coverage",
            "missing required CRG stage coverage",
            missingStages=missing_stages,
        )

    evidence_artifact_path = code_review_graph.get("evidenceArtifactPath")
    root = Path(repo_root or os.getcwd()).resolve()
    if evidence_artifact_path:
        artifact_path = (root / evidence_artifact_path).resolve()
        if not artifact_path.exists():
            return blocker("evidence_artifact_missing", "evidenceArtifactPath does not exist")

        root_path = normalize_root(allowed_evidence_root(root, evidence_carrier, phase_execution_dir))
        if not is_inside_path(artifact_path, root_path):
            return blocker(
                "evidence_artifact_outside_allowed_root",
                "evidenceArtifactPath resolves outside the allowed root",
            )

        try:
            artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return blocker("evidence_artifact_invalid_json", "evidence artifact is not valid JSON")

        if code_review_graph.get("adapterRunId") and artifact.get("adapterRunId") != code_review_graph.get("adapterRunId"):
            return blocker("adapter_run_id_mismatch", "adapterRunId does not match artifact content")
        if code_review_graph.get("evidenceDigest") and sha256_file(artifact_path) != code_review_graph.get("evidenceDigest"):
            return blocker("evidence_digest_mismatch", "evidenceDigest does not match artifact bytes")
        if not artifact.get("crgCliVersion") and not code_review_graph.get("crgCliVersion"):
            return blocker("crg_cli_version_missing", "crgCliVersion is required")

        decision["normalizedEvidence"] = {
            "artifactPath": artifact_path.relative_to(root).as_posix(),
            "adapterRunId": artifact.get("adapterRunId") or code_review_graph.get("adapterRunId"),
            "crgCliVersion": artifact.get("crgCliVersion") or code_review_graph.get("crgCliVersion"),
            "changedFiles": resolved_changed_files,
            "stages": stages,
        }
        return decision

    if code_changing and not code_review_graph.get("crgCliVersion"):
        return blocker("crg_cli_version_missing", "crgCliVersion is required")

    decision["normalizedEvidence"] = {
        "changedFiles": resolved_changed_files,
        "stages": stages,
        "crgCliVersion": code_review_graph.get("crgCliVersion"),
    }
    return decision
