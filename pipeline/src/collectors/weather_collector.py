"""기상청 초단기실황 응답을 원형 그대로 모으는 수집 계약."""

import json
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo


DEFAULT_KMA_API_URL = (
    "https://apis.data.go.kr/1360000/"
    "VilageFcstInfoService_2.0/getUltraSrtNcst"
)


class KmaUltraShortObservationClient:
    """Fetch KMA ultra-short observations without exposing the service key."""

    def __init__(self, service_key, base_url=DEFAULT_KMA_API_URL, timeout=30):
        if not service_key:
            raise ValueError("KMA_SERVICE_KEY is required")
        self.service_key = unquote(service_key)
        self.base_url = base_url
        self.timeout = timeout

    def fetch(self, **params):
        query = urlencode(
            {
                "serviceKey": self.service_key,
                "pageNo": 1,
                "numOfRows": 1000,
                "dataType": params["data_type"],
                "base_date": params["base_date"],
                "base_time": params["base_time"],
                "nx": params["nx"],
                "ny": params["ny"],
            }
        )
        try:
            with urlopen(f"{self.base_url}?{query}", timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ConnectionError("KMA weather API request failed") from exc

        header = ((payload.get("response") or {}).get("header") or {})
        if header.get("resultCode") != "00":
            raise ConnectionError(
                "KMA weather API returned an error: "
                + str(header.get("resultCode", "unknown"))
            )
        return payload


def latest_ultra_short_base_time(collected_at):
    """Return the newest observation hour expected to be available."""
    if not isinstance(collected_at, datetime) or collected_at.tzinfo is None:
        raise ValueError("collected_at must be a timezone-aware datetime")
    base = collected_at.replace(minute=0, second=0, microsecond=0)
    if collected_at.minute < 40:
        base -= timedelta(hours=1)
    return base


def normalize_ultra_short_observation(response, nx, ny):
    """Add identity metadata while preserving the KMA response body."""
    items = (
        ((((response.get("response") or {}).get("body") or {}).get("items") or {}).get("item"))
        or []
    )
    if not isinstance(items, list) or not items:
        raise ValueError("KMA weather response has no observation items")
    first = items[0]
    observed = datetime.strptime(
        f"{first['baseDate']} {first['baseTime']}", "%Y%m%d %H%M"
    ).replace(tzinfo=ZoneInfo("Asia/Seoul"))
    return {
        "weather_source": "observation",
        "observed_at": observed.isoformat(),
        "location_key": f"{int(nx)},{int(ny)}",
        "response": response["response"],
    }


def _to_iso(value):
    # 재고 데이터와 동일하게 시간대가 포함된 ISO 문자열만 허용한다.
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise ValueError("collected_at must include a timezone")
        return value.isoformat()
    if isinstance(value, str) and value:
        return value
    raise ValueError("collected_at must be a timezone-aware datetime or ISO string")


def collect_weather(client, base_date, base_time, nx, ny, collected_at):
    """Collect one KMA ultra-short observation response without mutation.

    ``client`` must provide ``fetch(**params)``. Authentication and HTTP
    configuration remain outside this pure function.
    """

    if not base_date or not base_time:
        raise ValueError("base_date and base_time are required")

    # data_type을 JSON으로 고정해 이후 품질검사가 하나의 응답 형태만 처리하게 한다.
    response = client.fetch(
        base_date=str(base_date),
        base_time=str(base_time),
        nx=int(nx),
        ny=int(ny),
        data_type="JSON",
    )
    if not isinstance(response, dict):
        raise ValueError("weather response must be a mapping")

    # 원본 payload와 요청 기준을 함께 반환해 재현 가능한 Raw 기록을 만든다.
    return {
        "source": "weather",
        "collected_at": _to_iso(collected_at),
        "request": {
            "base_date": str(base_date),
            "base_time": str(base_time),
            "nx": int(nx),
            "ny": int(ny),
            "data_type": "JSON",
        },
        "payload": response,
    }
