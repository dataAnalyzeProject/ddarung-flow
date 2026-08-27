from collections import defaultdict
from datetime import timedelta
from statistics import median
import json

MIN_SAMPLES = 10

def _percentile_90(values):
    ordered = sorted(values)
    return ordered[max(0, (len(ordered) * 90 + 99) // 100 - 1)] if ordered else None

def _stockout(rows):
    episodes, recoveries, start, previous = [], [], None, None
    for row in rows:
        timestamp, bikes = row["observed_at"], row["bike_count"]
        if start and timestamp - previous != timedelta(hours=1):
            episodes.append((start, previous)); start = None
        if bikes == 0 and start is None: start = timestamp
        if start and bikes >= 3:
            episodes.append((start, previous)); recoveries.append((timestamp - start).total_seconds() / 60); start = None
        previous = timestamp
    if start: episodes.append((start, previous))
    durations = [(end - begin).total_seconds() / 60 + 60 for begin, end in episodes]
    return {"medianDurationMinutes": median(durations) if durations else None, "p90DurationMinutes": _percentile_90(durations), "medianRecoveryMinutesToThree": median(recoveries) if recoveries else None, "episodeCount": len(episodes)}

def build_profiles(rows):
    grouped = defaultdict(list)
    for row in rows:
        # Curated excludes null/invalid counts; an absent hour is a missing observation.
        if row.get("bike_count") is not None: grouped[str(row["station_id"])].append(row)
    profiles = {}
    for station_number, values in grouped.items():
        values = sorted(values, key=lambda row: row["observed_at"])
        cells = defaultdict(list)
        for row in values: cells[(row["observed_at"].isoweekday(), row["observed_at"].hour)].append(row["bike_count"])
        weekday = [{"dayOfWeek": day, "hourOfDay": hour, "sampleCount": len(counts), "medianBikeCount": median(counts), "stockoutRate": sum(count == 0 for count in counts) / len(counts)} for (day, hour), counts in cells.items() if len(counts) >= MIN_SAMPLES]
        profiles[station_number] = {"windowStart": values[0]["observed_at"].date(), "windowEnd": values[-1]["observed_at"].date(), "sampleCount": len(values), "payload": {"weekdayHourly": weekday, "stockout": _stockout(values)}}
    return profiles

def publish_profiles(connection, profiles, station_number_to_id):
    skipped = 0
    with connection.cursor() as cursor:
        for number, profile in profiles.items():
            station_id = station_number_to_id.get(str(number))
            if not station_id: skipped += 1; continue
            cursor.execute("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (%s,%s,%s,%s,%s,CURRENT_TIMESTAMP) ON CONFLICT (station_id) DO UPDATE SET window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, sample_count=EXCLUDED.sample_count, payload=EXCLUDED.payload, generated_at=EXCLUDED.generated_at", (station_id, profile["windowStart"], profile["windowEnd"], profile["sampleCount"], json.dumps(profile["payload"])))
    return skipped
