"""Fixture-friendly model-performance snapshot calculations."""
from collections import defaultdict
from datetime import datetime

HORIZONS, QUANTITIES = (60, 120, 180, 240), (1, 2, 3, 4, 5)
MIN_SAMPLES, DEFAULT_MIN_SAMPLES, REFERENCE_HORIZON, REFERENCE_QUANTITY = {"STATION": 150}, 1000, 120, 3
CANONICAL = {(horizon, quantity) for horizon in HORIZONS for quantity in QUANTITIES}

def hour_bucket(hour):
    if 7 <= hour <= 9: return "COMMUTE_AM"
    if 10 <= hour <= 16: return "DAYTIME"
    if 17 <= hour <= 19: return "COMMUTE_PM"
    if 20 <= hour <= 21: return "EVENING"
    return "NIGHT"

def min_samples_for_axis(axis):
    return MIN_SAMPLES.get(axis, DEFAULT_MIN_SAMPLES)

def _metric(rows, axis=None):
    count = len(rows)
    if count < min_samples_for_axis(axis):
        return {"sampleCount": count, "baseRate": None, "brierScore": None, "baselineBrierScore": None, "skillScore": None, "shortageRecall": None, "status": "UNKNOWN_INSUFFICIENT_SAMPLES"}
    predicted, actual = [float(row["probability"]) for row in rows], [float(row["actual"]) for row in rows]
    base = sum(actual) / count; brier = sum((p - a) ** 2 for p, a in zip(predicted, actual)) / count; baseline = sum((base - a) ** 2 for a in actual) / count
    shortage = [p for p, a in zip(predicted, actual) if a == 0]
    return {"sampleCount": count, "baseRate": base, "brierScore": brier, "baselineBrierScore": baseline, "skillScore": None if baseline == 0 else 1 - brier / baseline, "shortageRecall": None if not shortage else sum(p < .5 for p in shortage) / len(shortage), "status": "OK"}

def evaluate_combinations(rows):
    grouped = defaultdict(list)
    for row in rows:
        key = int(row["horizonMinutes"]), int(row["requiredBikeCount"])
        if key not in CANONICAL: raise ValueError("unsupported horizonMinutes or requiredBikeCount")
        if not 0 <= float(row["probability"]) <= 1: raise ValueError("probability must be between zero and one")
        grouped[key].append(row)
    if set(grouped) != CANONICAL: raise ValueError("expected exactly 20 combinations")
    return [{"horizonMinutes": h, "requiredBikeCount": q, "sampleCount": (metric := _metric(grouped[(h, q)]))["sampleCount"], "brierScore": metric["brierScore"]} for h in HORIZONS for q in QUANTITIES]

def evaluate_segments(rows):
    groups = defaultdict(list)
    for row in rows:
        if (int(row["horizonMinutes"]), int(row["requiredBikeCount"])) != (REFERENCE_HORIZON, REFERENCE_QUANTITY): continue
        timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")); bucket, size = hour_bucket(timestamp.hour), row["stationSize"]
        values = {"HOUR_BUCKET": bucket, "DAY_TYPE": "WEEKEND" if timestamp.weekday() >= 5 else "WEEKDAY", "STATION_SIZE": size, "INVENTORY_LEVEL": row["inventoryLevel"], "FLOW_TYPE": row["flowType"], "HOUR_BUCKET_X_STATION_SIZE": f"{bucket}:{size}", "STATION": row["stationId"]}
        for axis, value in values.items(): groups[(axis, value)].append(row)
    return [{"axis": axis, "segmentValue": value, **_metric(items, axis)} for (axis, value), items in sorted(groups.items())]

def calibration_bins(rows):
    bins = [[] for _ in range(10)]
    for row in rows: bins[min(9, int(float(row["probability"]) * 10))].append(row)
    return [{"binLowerPercent": index * 10, "binUpperPercent": (index + 1) * 10, "sampleCount": len(items), "meanPredicted": None if not items else sum(float(item["probability"]) for item in items) / len(items), "actualRate": None if not items else sum(float(item["actual"]) for item in items) / len(items)} for index, items in enumerate(bins)]

def build_performance_payload(rows):
    reference = [row for row in rows if (int(row["horizonMinutes"]), int(row["requiredBikeCount"])) == (REFERENCE_HORIZON, REFERENCE_QUANTITY)]
    combination_calibration = [
        {
            "horizonMinutes": horizon,
            "requiredBikeCount": quantity,
            "bins": calibration_bins([
                row for row in rows
                if (int(row["horizonMinutes"]), int(row["requiredBikeCount"])) == (horizon, quantity)
            ]),
        }
        for horizon in HORIZONS for quantity in QUANTITIES
    ]
    return {"evaluation": {"method": "FIXED_WINDOW_REPLAY", "referenceHorizonMinutes": REFERENCE_HORIZON, "referenceRequiredBikeCount": REFERENCE_QUANTITY, "minSampleThreshold": DEFAULT_MIN_SAMPLES, "monotonicityViolations": 0}, "combinations": evaluate_combinations(rows), "segments": evaluate_segments(rows), "calibrationBins": calibration_bins(reference), "combinationCalibration": combination_calibration}

def assert_brier_matches_reference(combinations, reference_combinations, tolerance=1e-9):
    actual = {(row["horizonMinutes"], row["requiredBikeCount"]): row["brierScore"] for row in combinations}
    expected = {(row["horizonMinutes"], row["requiredBikeCount"]): row["brierScore"] for row in reference_combinations}
    if set(actual) != CANONICAL or set(expected) != CANONICAL: raise ValueError("both inputs must contain 20 canonical combinations")
    mismatches = [key for key in CANONICAL if actual[key] is None or abs(actual[key] - expected[key]) > tolerance]
    if mismatches: raise ValueError(f"Brier score mismatch for {sorted(mismatches)}")
