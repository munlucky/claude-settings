#!/usr/bin/env python3
import argparse
import glob
import json
import os
from pathlib import Path


RUN_DIMENSION_WEIGHTS = {
    "executionReliability": 30,
    "verificationReliability": 25,
    "artifactDiscipline": 20,
    "isolationDiscipline": 15,
    "retryEfficiency": 10,
}


def bool_score(value):
    return 100.0 if value else 0.0


def average(scores):
    values = [value for value in scores if value is not None]
    if not values:
        return 0.0
    return sum(values) / len(values)


def compute_run_dimensions(run):
    checks = run.get("checks", {})
    counters = run.get("counters", {})

    execution = average(
        [
            bool_score(run.get("taskOutcomePassed", False)),
            bool_score(checks.get("requiredChecksPassed", False)),
            bool_score(checks.get("scorecardDone", False)),
        ]
    )
    verification = average(
        [
            bool_score(checks.get("requiredChecksPassed", False)),
            bool_score(checks.get("knowledgeAuditPassed", False)),
            bool_score(checks.get("codePolicyPassed", False)),
            bool_score(checks.get("workflowChecksPassed", False)),
        ]
    )
    artifact = average(
        [
            bool_score(checks.get("artifactsComplete", False)),
            bool_score(checks.get("scorecardDone", False)),
            bool_score(checks.get("tddFailureObserved", False)),
        ]
    )
    isolation = average(
        [
            bool_score(checks.get("mainStayedClean", False)),
            bool_score(checks.get("candidateFlowWorked", False)),
        ]
    )

    retry_count = int(counters.get("retryCount", 0))
    handoff_count = int(counters.get("handoffCount", 0))
    retry_efficiency = max(0.0, 100.0 - (retry_count * 15.0) - (handoff_count * 10.0))

    return {
        "executionReliability": execution,
        "verificationReliability": verification,
        "artifactDiscipline": artifact,
        "isolationDiscipline": isolation,
        "retryEfficiency": retry_efficiency,
    }


def weighted_score(dimensions):
    total_weight = sum(RUN_DIMENSION_WEIGHTS.values())
    total = 0.0
    for key, weight in RUN_DIMENSION_WEIGHTS.items():
        total += dimensions[key] * weight
    return total / total_weight


def confidence_from_sample_count(sample_count, min_samples):
    if min_samples <= 0:
        return 100.0
    return min(sample_count / float(min_samples), 1.0) * 100.0


def diversity_score(runs):
    if not runs:
        return 0.0

    planes = {run.get("plane", "unknown") for run in runs}
    project_types = {run.get("projectType", "unknown") for run in runs}
    complexities = {run.get("complexity", "unknown") for run in runs}

    plane_score = min(len(planes) / 2.0, 1.0) * 100.0
    project_score = min(len(project_types) / 3.0, 1.0) * 100.0
    complexity_score = min(len(complexities) / 3.0, 1.0) * 100.0
    return average([plane_score, project_score, complexity_score])


def aggregate_report(runs, min_samples):
    scored_runs = []
    for run in runs:
        dimensions = compute_run_dimensions(run)
        scored_runs.append(
            {
                "runId": run.get("runId", "unknown"),
                "plane": run.get("plane", "unknown"),
                "projectType": run.get("projectType", "unknown"),
                "complexity": run.get("complexity", "unknown"),
                "taskId": run.get("taskId", "unknown"),
                "dimensions": dimensions,
                "runScore": round(weighted_score(dimensions), 2),
            }
        )

    raw_average = average([entry["runScore"] for entry in scored_runs])
    sample_count = len(scored_runs)
    confidence_score = confidence_from_sample_count(sample_count, min_samples)
    diversity = diversity_score(runs)
    normalized = (raw_average * 0.7) + (confidence_score * 0.15) + (diversity * 0.15)

    if sample_count < min_samples:
        status = "provisional"
    elif normalized >= 85.0 and diversity >= 60.0:
        status = "stable"
    else:
        status = "emerging"

    return {
        "schemaVersion": "1.0",
        "summary": {
            "sampleCount": sample_count,
            "minimumStableSamples": min_samples,
            "rawAverageScore": round(raw_average, 2),
            "confidenceScore": round(confidence_score, 2),
            "diversityScore": round(diversity, 2),
            "normalizedHarnessQuality": round(normalized, 2),
            "status": status,
        },
        "weights": RUN_DIMENSION_WEIGHTS,
        "runs": scored_runs,
    }


def load_runs(pattern):
    paths = sorted(glob.glob(pattern, recursive=True))
    runs = []
    for path_str in paths:
        path = Path(path_str)
        if not path.is_file():
            continue
        runs.append(json.loads(path.read_text(encoding="utf-8")))
    return runs


def main():
    env_min_samples = os.environ.get("HARNESS_QUALITY_MIN_SAMPLES")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-glob", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--min-samples",
        type=int,
        default=int(env_min_samples) if env_min_samples else 3,
    )
    args = parser.parse_args()

    runs = load_runs(args.input_glob)
    report = aggregate_report(runs, args.min_samples)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    summary = report["summary"]
    print(f"Sample count: {summary['sampleCount']}")
    print(f"Raw average score: {summary['rawAverageScore']}")
    print(f"Confidence score: {summary['confidenceScore']}")
    print(f"Diversity score: {summary['diversityScore']}")
    print(f"Normalized harness quality: {summary['normalizedHarnessQuality']}")
    print(f"Status: {summary['status']}")


if __name__ == "__main__":
    main()
