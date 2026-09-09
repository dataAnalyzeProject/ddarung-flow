"""서울시 실시간 따릉이 재고 응답을 원형 그대로 수집한다."""

import json
import random
import socket
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen


DEFAULT_SEOUL_BIKE_API_URL = "http://openapi.seoul.go.kr:8088"
PAGE_RETRY_MAX_ATTEMPTS = 2
PAGE_RETRY_BASE_SECONDS = 5
PAGE_RETRY_JITTER_SECONDS = 5


class SeoulBikeTransportError(ConnectionError):
    """A secret-safe Seoul bike transport failure classification."""

    def __init__(self, category, retryable, http_status=None):
        super().__init__(f"Seoul bike API transport failure: {category}")
        self.category = category
        self.retryable = retryable
        self.http_status = http_status


def _transport_error(exc):
    if isinstance(exc, HTTPError):
        category = "HTTP_4XX" if 400 <= exc.code < 500 else "HTTP_5XX" if 500 <= exc.code < 600 else "OTHER_TRANSPORT"
        return SeoulBikeTransportError(category, category == "HTTP_5XX", http_status=exc.code)
    if isinstance(exc, TimeoutError):
        return SeoulBikeTransportError("TIMEOUT", True)

    reason = exc.reason if isinstance(exc, URLError) else exc
    if isinstance(reason, socket.gaierror):
        return SeoulBikeTransportError("DNS_ERROR", True)
    if isinstance(reason, TimeoutError):
        return SeoulBikeTransportError("TIMEOUT", True)
    if isinstance(reason, ConnectionRefusedError):
        return SeoulBikeTransportError("CONNECTION_REFUSED", True)
    if isinstance(reason, ConnectionResetError):
        return SeoulBikeTransportError("CONNECTION_RESET", True)
    if getattr(reason, "errno", None) in {101, 113}:
        return SeoulBikeTransportError("NETWORK_UNREACHABLE", True)
    return SeoulBikeTransportError("OTHER_TRANSPORT", True)


def page_retry_delay(random_source=random.uniform):
    jitter = min(max(random_source(0, PAGE_RETRY_JITTER_SECONDS), 0), PAGE_RETRY_JITTER_SECONDS)
    return PAGE_RETRY_BASE_SECONDS + jitter


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
            raise _transport_error(exc) from None


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


def _provider_total_count(value):
    if type(value) is int:
        return value if value >= 0 else None
    if isinstance(value, str) and value and value.isascii() and value.isdigit():
        return int(value)
    return None


def has_complete_pagination_evidence(evidence, actual_row_count):
    """완료된 모든 페이지와 실제 병합 행 수가 일치할 때만 참을 반환한다."""
    if not isinstance(evidence, dict):
        return False
    integer_fields = (
        "page_size",
        "page_count",
        "expected_row_count",
        "row_count",
        "terminal_page_row_count",
    )
    if any(type(evidence.get(field)) is not int for field in integer_fields):
        return False

    page_size = evidence["page_size"]
    page_count = evidence["page_count"]
    expected_count = evidence["expected_row_count"]
    row_count = evidence["row_count"]
    terminal_count = evidence["terminal_page_row_count"]
    if page_size <= 0 or page_count <= 0 or expected_count < 0:
        return False
    expected_page_count = max(1, (expected_count + page_size - 1) // page_size)
    expected_terminal_count = expected_count - (page_count - 1) * page_size
    return (
        evidence.get("status") == "COMPLETE"
        and evidence.get("reason") is None
        and page_count == expected_page_count
        and terminal_count == expected_terminal_count
        and 0 <= terminal_count <= page_size
        and expected_count == actual_row_count
        and row_count == actual_row_count
    )


def _collection_result(collected_at, payloads, merged_rows, first_result, evidence):
    total_count = evidence.get("expected_row_count")
    payload = {
        "rentBikeStatus": {
            "list_total_count": (
                total_count if isinstance(total_count, int) else len(merged_rows)
            ),
            "RESULT": first_result or {},
            "row": merged_rows,
        },
        "collection_evidence": evidence,
    }
    return {
        "source": "bike_inventory",
        "collected_at": _to_iso(collected_at),
        "payloads": payloads,
        "collection_evidence": evidence,
        "payload": payload,
    }


def collect_bike_inventory(client, collected_at, page_size=1000, sleep=time.sleep, random_source=random.uniform):
    """마지막 페이지까지 조회하고 원본 페이지와 통합 응답을 반환한다."""
    page_size = _as_positive_int(page_size, "page_size")
    payloads = []
    merged_rows = []
    seen_station_ids = set()
    first_result = None
    expected_row_count = None
    start_index = 1
    terminal_page_row_count = None
    failure_reason = None

    while True:
        end_index = start_index + page_size - 1
        for attempt in range(1, PAGE_RETRY_MAX_ATTEMPTS + 1):
            try:
                response = client.fetch_page(start_index, end_index)
                break
            except SeoulBikeTransportError as exc:
                if not exc.retryable or attempt == PAGE_RETRY_MAX_ATTEMPTS:
                    raise
                print(
                    f"event=inventory_page_retry category={exc.category} attempt={attempt + 1}",
                    flush=True,
                )
                sleep(page_retry_delay(random_source))
        if not isinstance(response, dict):
            raise ValueError("bike inventory response must be a mapping")
        payloads.append(response)

        node = _inventory_node(response)
        if not isinstance(node, dict):
            failure_reason = "MALFORMED_PAGE"
            break
        if first_result is None:
            first_result = node.get("RESULT")
        result = node.get("RESULT")
        if not isinstance(result, dict) or result.get("CODE") != "INFO-000":
            failure_reason = "API_ERROR"
            break
        rows = node.get("row")
        if not isinstance(rows, list):
            failure_reason = "MALFORMED_PAGE"
            break

        declared_page_count = _provider_total_count(node.get("list_total_count"))
        if declared_page_count is None:
            failure_reason = "PAGE_CONTINUITY_BREAK"
            break
        if expected_row_count is None:
            expected_row_count = declared_page_count
        elif declared_page_count != expected_row_count:
            failure_reason = "PAGE_CONTINUITY_BREAK"
            break

        remaining_count = expected_row_count - len(merged_rows)
        expected_page_row_count = min(page_size, remaining_count)
        if remaining_count < 0 or len(rows) != expected_page_row_count:
            if payloads[:-1] and not rows and remaining_count > 0:
                failure_reason = "EMPTY_FOLLOW_UP_PAGE"
            else:
                failure_reason = "PAGE_CONTINUITY_BREAK"
            terminal_page_row_count = len(rows)
            break
        page_station_ids = []
        for row in rows:
            if not isinstance(row, dict):
                failure_reason = "MALFORMED_ROW"
                break
            station_id = str(row.get("stationId") or "").strip()
            if not station_id:
                failure_reason = "MALFORMED_ROW"
                break
            if station_id in seen_station_ids or station_id in page_station_ids:
                failure_reason = "DUPLICATE_STATION"
                break
            page_station_ids.append(station_id)
        if failure_reason:
            terminal_page_row_count = len(rows)
            break

        merged_rows.extend(rows)
        seen_station_ids.update(page_station_ids)
        terminal_page_row_count = len(rows)

        # provider의 전체 행 수와 지금까지 받은 행 수가 일치해야 cycle이 끝난다.
        if len(merged_rows) == expected_row_count:
            break
        start_index += page_size

    evidence = {
        "status": "PARTIAL" if failure_reason else "COMPLETE",
        "reason": failure_reason,
        "page_size": page_size,
        "page_count": len(payloads),
        "expected_row_count": expected_row_count,
        "row_count": len(merged_rows),
        "terminal_page_row_count": terminal_page_row_count,
    }
    return _collection_result(
        collected_at, payloads, merged_rows, first_result, evidence
    )
