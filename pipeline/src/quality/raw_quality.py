"""Curated 처리 전에 Raw 응답을 통과·차단하는 품질 게이트."""


LEAKAGE_FIELDS = {
    # 예측시점에 알 수 없는 정답·미래값은 Raw 단계에서 탐지한다.
    "future_bike_count",
    "target_bike_count",
    "bike_count_60m",
    "label",
    "target",
}


def _contains_leakage_field(value):
    # 중첩 JSON 전체를 재귀적으로 확인해 숨은 미래 필드도 놓치지 않는다.
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in LEAKAGE_FIELDS:
                return True
            if _contains_leakage_field(child):
                return True
    elif isinstance(value, list):
        return any(_contains_leakage_field(item) for item in value)
    return False


def _bike_quality(payload):
    reasons = []
    metrics = {
        "row_count": 0,
        "zero_bike_count": 0,
        "negative_bike_count": 0,
        "missing_required_count": 0,
    }

    bike_list = None
    if isinstance(payload, dict):
        bike_list = payload.get("rentBikeStatus") or payload.get("bikeList")
    if not isinstance(bike_list, dict):
        reasons.append("missing_bike_list")
        return reasons, metrics

    result = bike_list.get("RESULT") or {}
    if result.get("CODE") not in (None, "INFO-000"):
        reasons.append("api_error")

    # 0대는 정상 관측값이며, 빈 응답·누락·음수와 구분한다.
    rows = bike_list.get("row") or []
    if not isinstance(rows, list) or not rows:
        reasons.append("empty_inventory")
        return reasons, metrics

    metrics["row_count"] = len(rows)
    for row in rows:
        if not isinstance(row, dict):
            metrics["missing_required_count"] += 1
            continue
        required_values = [
            row.get("stationId"),
            row.get("stationName"),
            row.get("parkingBikeTotCnt"),
            row.get("rackTotCnt"),
            row.get("stationLatitude"),
            row.get("stationLongitude"),
        ]
        if any(value in (None, "") for value in required_values):
            metrics["missing_required_count"] += 1
            continue
        try:
            numeric_count = int(row["parkingBikeTotCnt"])
            int(row["rackTotCnt"])
            float(row["stationLatitude"])
            float(row["stationLongitude"])
        except (TypeError, ValueError):
            metrics["missing_required_count"] += 1
            continue
        if numeric_count < 0:
            metrics["negative_bike_count"] += 1
        elif numeric_count == 0:
            metrics["zero_bike_count"] += 1

    if metrics["missing_required_count"]:
        reasons.append("missing_required_field")
    if metrics["negative_bike_count"]:
        reasons.append("negative_bike_count")
    return reasons, metrics


def _weather_quality(payload):
    reasons = []
    metrics = {"weather_source": None, "item_count": 0, "categories": []}
    if not isinstance(payload, dict):
        return ["invalid_weather_payload"], metrics

    # 관측과 예보를 명시적으로 나눠 학습 시 미래 정보가 섞이지 않게 한다.
    weather_source = payload.get("weather_source")
    metrics["weather_source"] = weather_source
    if weather_source not in {"observation", "forecast"}:
        reasons.append("missing_or_invalid_weather_source")
    if not payload.get("observed_at") or not payload.get("location_key"):
        reasons.append("missing_weather_identity")

    response = payload.get("response") or {}
    header = response.get("header") or {}
    if header.get("resultCode") not in (None, "00"):
        reasons.append("api_error")
    items = (((response.get("body") or {}).get("items") or {}).get("item") or [])
    if not isinstance(items, list) or not items:
        reasons.append("empty_weather")
        return reasons, metrics

    categories = [item.get("category") for item in items if isinstance(item, dict)]
    metrics["item_count"] = len(items)
    metrics["categories"] = sorted(category for category in categories if category)
    if "T1H" not in categories or "RN1" not in categories:
        reasons.append("missing_weather_measurement")
    return reasons, metrics


def validate_raw_quality(source, payload):
    """Return a serializable pass/fail result without mutating Raw data."""

    # 지원하지 않는 소스는 자동 통과시키지 않고 명시적으로 차단한다.
    if source == "bike_inventory":
        reasons, metrics = _bike_quality(payload)
    elif source == "weather":
        reasons, metrics = _weather_quality(payload)
    else:
        reasons, metrics = ["unsupported_source"], {}

    if _contains_leakage_field(payload):
        reasons.append("future_leakage_field")

    unique_reasons = list(dict.fromkeys(reasons))
    return {
        "source": source,
        "passed": not unique_reasons,
        "reasons": unique_reasons,
        "metrics": metrics,
    }
