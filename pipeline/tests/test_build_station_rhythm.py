from datetime import datetime
from pipeline.src.profiles.build_station_rhythm import build_profiles, publish_profiles

def test_excludes_missing_and_low_sample_cells():
    rows=[{"station_id":"108","observed_at":datetime(2026,1,5,8),"bike_count":0} for _ in range(10)] + [{"station_id":"108","observed_at":datetime(2026,1,5,9),"bike_count":None}]
    profile=build_profiles(rows)["108"]
    assert len(profile["weekdayHourly"]) == 1
    assert profile["weekdayHourly"][0]["stockoutRate"] == 1

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
    skipped=publish_profiles(connection,{"108":{"weekdayHourly":[],"stockout":{}},"404":{"weekdayHourly":[],"stockout":{}}},{"108":"ST-10"})
    assert skipped == 1
    assert connection.cursor_value.calls[0][1][0] == "ST-10"
