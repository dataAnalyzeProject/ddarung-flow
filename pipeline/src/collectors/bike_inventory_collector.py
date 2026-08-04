"""서울시 실시간 따릉이 재고 응답을 원형 그대로 수집한다."""

import json
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


DEFAULT_SEOUL_BIKE_API_URL = "http://openapi.seoul.go.kr:8088"


class SeoulBikeApiClient:
    """서울시 실시간 따릉이 대여정보를 페이지 단위로 조회한다."""

    def __init__(self, api_key, base_url=DEFAULT_SEOUL_BIKE_API_URL, timeout=30):
        if not api_key:
            raise ValueError("SEOUL_OPEN_API_KEY is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def fetch_page(self, start_index, end_index):
        url = (
            f"{self.base_url}/{quote(self.api_key, safe='')}/json/"
            f"bikeList/{start_index}/{end_index}/"
        )
        try:
            with urlopen(url, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            raise ConnectionError("Seoul bike API request failed") from exc


def _to_iso(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError("collected_at must include a timezone")
        return value.isoformat()
    if isinstance(value, str) and value:
        return value
    raise ValueError("collected_at must be a timezone-aware datetime or ISO string")


def _as_positive_int(value, field_name):
    try:
        converted = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc
    if converted <= 0:
        raise ValueError(f"{field_name} must be greater than zero")
    return converted


def _inventory_node(response):
    """실제 응답명과 기존 fixture 응답명을 모두 허용한다."""
    for key in ("rentBikeStatus", "bikeList"):
        value = response.get(key)
        if isinstance(value, dict):
            return value
    return None


def collect_bike_inventory(client, collected_at, page_size=1000):
    """마지막 페이지까지 조회하고 원본 페이지와 통합 응답을 반환한다."""
    page_size = _as_positive_int(page_size, "page_size")
    payloads = []
    merged_rows = []
    first_result = None
    start_index = 1

    while True:
        end_index = start_index + page_size - 1
        response = client.fetch_page(start_index, end_index)
        if not isinstance(response, dict):
            raise ValueError("bike inventory response must be a mapping")
        payloads.append(response)

        node = _inventory_node(response)
        if not isinstance(node, dict):
            break
        if first_result is None:
            first_result = node.get("RESULT")
        rows = node.get("row") or []
        if not isinstance(rows, list):
            break
        merged_rows.extend(rows)

        # 실제 API는 list_total_count를 페이지 건수로 반환하므로 행 수로 끝을 찾는다.
        if len(rows) < page_size:
            break
        start_index += page_size

    return {
        "source": "bike_inventory",
        "collected_at": _to_iso(collected_at),
        "payloads": payloads,
        "payload": {
            "rentBikeStatus": {
                "list_total_count": len(merged_rows),
                "RESULT": first_result or {},
                "row": merged_rows,
            }
        },
    }
