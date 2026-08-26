"""Fixture-friendly segment evaluation for the approved six-bucket artifact."""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime
import math

AXES = ("HOUR_BUCKET", "DAY_TYPE", "STATION_SIZE", "INVENTORY_LEVEL", "FLOW_TYPE", "HOUR_BUCKET_X_STATION_SIZE")
MIN_SAMPLES = 1000

def hour_bucket(hour):
    if 7 <= hour <= 9: return "COMMUTE_AM"
    if 10 <= hour <= 16: return "DAYTIME"
    if 17 <= hour <= 19: return "COMMUTE_PM"
    if 20 <= hour <= 21: return "EVENING"
    return "NIGHT"

def _metric(rows):
    count = len(rows)
    if count < MIN_SAMPLES: return {"sampleCount": count, "baseRate": None, "brierScore": None, "baselineBrierScore": None, "skillScore": None, "shortageRecall": None, "status": "UNKNOWN_INSUFFICIENT_SAMPLES"}
    actual = [float(row["actual"]) for row in rows]; predicted = [float(row["probability"]) for row in rows]
    base = sum(actual) / count; brier = sum((p - a) ** 2 for p, a in zip(predicted, actual)) / count; baseline = sum((base - a) ** 2 for a in actual) / count
    shortage = [p for p, a in zip(predicted, actual) if a == 0]
    return {"sampleCount": count, "baseRate": base, "brierScore": brier, "baselineBrierScore": baseline, "skillScore": None if baseline == 0 else 1 - brier / baseline, "shortageRecall": None if not shortage else sum(p < .5 for p in shortage) / len(shortage), "status": "OK"}

def evaluate_segments(rows):
    """Evaluate H2/3-bike rows supplied as small deterministic fixtures."""
    groups = defaultdict(list)
    for row in rows:
        timestamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")); station_size = row["stationSize"]
        values = {"HOUR_BUCKET": hour_bucket(timestamp.hour), "DAY_TYPE": "WEEKEND" if timestamp.weekday() >= 5 else "WEEKDAY", "STATION_SIZE": station_size, "INVENTORY_LEVEL": row["inventoryLevel"], "FLOW_TYPE": row["flowType"], "HOUR_BUCKET_X_STATION_SIZE": f"{hour_bucket(timestamp.hour)}:{station_size}"}
        for axis, value in values.items(): groups[(axis, value)].append(row)
    return [{"axis": axis, "segmentValue": value, **_metric(items)} for (axis, value), items in sorted(groups.items())]

def calibration_bins(rows):
    bins = [[] for _ in range(10)]
    for row in rows: bins[min(9, int(float(row["probability"]) * 10))].append(row)
    return [{"binLowerPercent": index * 10, "binUpperPercent": (index + 1) * 10, "sampleCount": len(items), "meanPredicted": None if not items else sum(float(x["probability"]) for x in items) / len(items), "actualRate": None if not items else sum(float(x["actual"]) for x in items) / len(items)} for index, items in enumerate(bins)]

def validate_combinations(combinations):
    if len(combinations) != 20: raise ValueError("expected exactly 20 combinations")
    return combinations
