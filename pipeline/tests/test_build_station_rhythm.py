from datetime import datetime
from pipeline.src.profiles.build_station_rhythm import build_profiles, publish_profiles

def test_excludes_missing_and_low_sample_cells():
    rows=[{"station_id":"108","observed_at":datetime(2026,1,5,8),"bike_count":0} for _ in range(10)] + [{"station_id":"108","observed_at":datetime(2026,1,5,9),"bike_count":None}]
    profile=build_profiles(rows)["108"]
    assert len(profile["payload"]["weekdayHourly"]) == 1
    assert profile["payload"]["weekdayHourly"][0]["stockoutRate"] == 1
    assert profile["windowStart"].isoformat() == "2026-01-05"

def test_stockout_gap_is_not_merged_and_recovery_requires_three_bikes():
    rows = [
        {"station_id":"108", "observed_at":datetime(2026,1,5,8), "bike_count":0},
        {"station_id":"108", "observed_at":datetime(2026,1,5,9), "bike_count":0},
        {"station_id":"108", "observed_at":datetime(2026,1,5,11), "bike_count":0},
        {"station_id":"108", "observed_at":datetime(2026,1,5,12), "bike_count":2},
        {"station_id":"108", "observed_at":datetime(2026,1,5,13), "bike_count":3},
    ]
    stockout = build_profiles(rows)["108"]["payload"]["stockout"]
    assert stockout["episodeCount"] == 2
    assert stockout["medianRecoveryMinutesToThree"] == 120

def test_stockout_duration_ends_at_first_positive_bike_but_recovery_waits_for_three():
    rows = [
        {"station_id":"108", "observed_at":datetime(2026,1,5,8), "bike_count":0},
        {"station_id":"108", "observed_at":datetime(2026,1,5,9), "bike_count":1},
        {"station_id":"108", "observed_at":datetime(2026,1,5,10), "bike_count":2},
        {"station_id":"108", "observed_at":datetime(2026,1,5,11), "bike_count":3},
    ]
    stockout = build_profiles(rows)["108"]["payload"]["stockout"]
    assert stockout["episodeCount"] == 1
    assert stockout["medianDurationMinutes"] == 60
    assert stockout["medianRecoveryMinutesToThree"] == 180

class Cursor:
    def __init__(self): self.calls=[]
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def execute(self,*args): self.calls.append(args)
class Connection:
    def __init__(self): self.cursor_value=Cursor()
    def cursor(self): return self.cursor_value

def test_maps_public_number_to_internal_station_id_and_counts_missing():
    connection=Connection()
    profile = {"windowStart":datetime(2026,1,1).date(), "windowEnd":datetime(2026,1,2).date(), "sampleCount":2, "payload":{"weekdayHourly":[],"stockout":{}}}
    skipped=publish_profiles(connection,{"108":profile,"404":profile},{"108":"ST-10"})
    assert skipped == 1
    assert connection.cursor_value.calls[0][1][0] == "ST-10"
