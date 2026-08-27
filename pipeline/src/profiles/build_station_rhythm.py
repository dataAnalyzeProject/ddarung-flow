from collections import defaultdict
from datetime import timedelta
import json

MIN_SAMPLES = 10
def build_profiles(rows):
    grouped=defaultdict(list)
    for row in rows:
        if row.get("bike_count") is not None: grouped[str(row["station_id"])].append(row)
    result={}
    for station_id, values in grouped.items():
        cells=defaultdict(list)
        for row in values: cells[(row["observed_at"].isoweekday(), row["observed_at"].hour)].append(row["bike_count"])
        weekday=[{"dayOfWeek":d,"hourOfDay":h,"sampleCount":len(v),"medianBikeCount":sorted(v)[len(v)//2],"stockoutRate":sum(x==0 for x in v)/len(v)} for (d,h),v in cells.items() if len(v)>=MIN_SAMPLES]
        result[station_id]={"weekdayHourly":weekday,"stockout":{"medianDurationMinutes":None,"p90DurationMinutes":None,"medianRecoveryMinutesToThree":None,"episodeCount":0}}
    return result

def publish_profiles(connection, profiles, station_number_to_id):
    skipped=0
    with connection.cursor() as cursor:
        for number,payload in profiles.items():
            station_id=station_number_to_id.get(str(number))
            if not station_id: skipped+=1; continue
            cursor.execute("INSERT INTO station_rhythm_profiles (station_id, window_start, window_end, sample_count, payload, generated_at) VALUES (%s,CURRENT_DATE,CURRENT_DATE,%s,%s,CURRENT_TIMESTAMP) ON CONFLICT (station_id) DO UPDATE SET payload=EXCLUDED.payload, sample_count=EXCLUDED.sample_count, generated_at=EXCLUDED.generated_at",(station_id,sum(x["sampleCount"] for x in payload["weekdayHourly"]),json.dumps(payload)))
    return skipped
