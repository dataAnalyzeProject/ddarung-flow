"""Export deterministic H1-H4 by required-bike-count evaluation rows."""

from typing import Any, Dict, List, Tuple

EXPECTED_HORIZONS = (60, 120, 180, 240)
EXPECTED_QUANTITIES = (1, 2, 3, 4, 5)
EXPECTED_COMBINATIONS = {
    (h, q) for h in EXPECTED_HORIZONS for q in EXPECTED_QUANTITIES
}


def export_metric_rows(metric_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate and sort exactly 20 contract evaluation rows (4 horizons x 5 quantities).

    Raises ValueError if metric_rows is not a list, doesn't contain exactly 20 rows,
    or is missing required horizon/quantity combinations, or contains duplicate combinations.
    """
    if not isinstance(metric_rows, list):
        raise ValueError("metric_rows must be a list")

    if len(metric_rows) != 20:
        raise ValueError(f"expected exactly 20 metric rows, got {len(metric_rows)}")

    seen_combos: set[Tuple[int, int]] = set()
    cleaned_rows: List[Dict[str, Any]] = []

    for idx, row in enumerate(metric_rows):
        if not isinstance(row, dict):
            raise ValueError(f"row_{idx} is not a dictionary")

        if "horizonMinutes" not in row or "requiredBikeCount" not in row:
            raise ValueError(f"row_{idx} missing 'horizonMinutes' or 'requiredBikeCount'")

        try:
            hz = int(row["horizonMinutes"])
            qty = int(row["requiredBikeCount"])
        except (ValueError, TypeError) as exc:
            raise ValueError(f"row_{idx} has non-integer horizon or quantity: {exc}")

        combo = (hz, qty)
        if combo not in EXPECTED_COMBINATIONS:
            raise ValueError(f"row_{idx} has unsupported horizon {hz} or quantity {qty}")

        if combo in seen_combos:
            raise ValueError(f"duplicate combination found for horizon {hz}, quantity {qty}")

        seen_combos.add(combo)
        cleaned_rows.append(row)

    missing_combos = EXPECTED_COMBINATIONS - seen_combos
    if missing_combos:
        raise ValueError(f"missing metric combinations: {sorted(missing_combos)}")

    # Sort deterministically by (horizonMinutes, requiredBikeCount)
    cleaned_rows.sort(key=lambda r: (int(r["horizonMinutes"]), int(r["requiredBikeCount"])))

    return cleaned_rows
