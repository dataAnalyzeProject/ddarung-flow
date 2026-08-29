"""Strict, provider-response-only validation for a Valhalla bicycle route."""

from __future__ import annotations

import math
from typing import Any


SEOUL_LATITUDE = (37.3, 37.8)
SEOUL_LONGITUDE = (126.7, 127.3)


def distance_meters(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*first, *second))
    return 6_371_000 * 2 * math.asin(math.sqrt(
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    ))


def decode_polyline6(encoded: str) -> list[tuple[float, float]]:
    coordinates: list[tuple[float, float]] = []
    latitude = longitude = index = 0
    while index < len(encoded):
        values = []
        for _ in range(2):
            result = shift = 0
            while True:
                if index >= len(encoded):
                    raise ValueError("truncated polyline6 shape")
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            values.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += values[0]
        longitude += values[1]
        coordinates.append((latitude / 1_000_000, longitude / 1_000_000))
    return coordinates


def validate_route(payload: dict[str, Any], origin: tuple[float, float], destination: tuple[float, float]) -> dict[str, Any]:
    trip = payload.get("trip")
    if not isinstance(trip, dict):
        raise ValueError("response has no trip object")
    summary = trip.get("summary")
    legs = trip.get("legs")
    if not isinstance(summary, dict) or not isinstance(legs, list) or not legs:
        raise ValueError("response has no route legs")

    distance_m = float(summary.get("length", 0)) * 1_000
    duration_s = float(summary.get("time", 0))
    if not math.isfinite(distance_m) or not math.isfinite(duration_s) or distance_m <= 0 or duration_s <= 0:
        raise ValueError("route distance or duration is invalid")

    coordinates: list[tuple[float, float]] = []
    maneuver_count = 0
    for leg in legs:
        if not isinstance(leg, dict) or not isinstance(leg.get("shape"), str) or not leg["shape"]:
            raise ValueError("each route leg must contain an encoded shape")
        maneuvers = leg.get("maneuvers")
        if not isinstance(maneuvers, list) or not maneuvers:
            raise ValueError("each route leg must contain maneuvers")
        decoded = decode_polyline6(leg["shape"])
        if len(decoded) < 2:
            raise ValueError("each leg shape must decode to at least two coordinates")
        coordinates.extend(decoded)
        maneuver_count += len(maneuvers)

    if any(not math.isfinite(value) for coordinate in coordinates for value in coordinate):
        raise ValueError("route geometry contains non-finite coordinates")
    if any(not (SEOUL_LATITUDE[0] <= lat <= SEOUL_LATITUDE[1] and SEOUL_LONGITUDE[0] <= lon <= SEOUL_LONGITUDE[1]) for lat, lon in coordinates):
        raise ValueError("route geometry leaves the Seoul representative-route envelope")
    if distance_m <= distance_meters(origin, destination):
        raise ValueError("route distance is not longer than straight-line distance")
    if distance_meters(coordinates[0], origin) > 2_000 or distance_meters(coordinates[-1], destination) > 2_000:
        raise ValueError("route geometry endpoint is not reasonably near the requested location")

    return {
        "distanceMeters": round(distance_m, 1),
        "durationSeconds": round(duration_s, 1),
        "legCount": len(legs),
        "shapePointCount": len(coordinates),
        "maneuverCount": maneuver_count,
    }
