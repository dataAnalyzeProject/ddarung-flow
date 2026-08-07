import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd
import numpy as np
from pipeline.src.labeling import generate_h1_h4_labels

def test_h1_h4_exact_labeling():
    # Mock data: station ST001 with 10:00, 11:00 (+60m), 12:00 (+120m), 14:00 (+240m)
    records = [
        {"station_id": "ST001", "observed_at": "2024-01-01 10:00:00", "bike_count": 3},
        {"station_id": "ST001", "observed_at": "2024-01-01 11:00:00", "bike_count": 4},
        {"station_id": "ST001", "observed_at": "2024-01-01 12:00:00", "bike_count": 0},
        # 13:00 missing
        {"station_id": "ST001", "observed_at": "2024-01-01 14:00:00", "bike_count": 5},
    ]
    df_mock = pd.DataFrame(records)

    df_labeled = generate_h1_h4_labels(df_mock)
    
    row_10 = df_labeled[df_labeled['feature_as_of'] == pd.to_datetime("2024-01-01 10:00:00")].iloc[0]

    assert row_10['target_valid_h1'] == True, "H1 (11:00) 존재함"
    assert row_10['future_bike_count_h1'] == 4.0
    assert row_10['label_h1_t1'] == 1.0, "4대 >= 1대 -> label 1"

    assert row_10['target_valid_h2'] == True, "H2 (12:00) 존재함"
    assert row_10['future_bike_count_h2'] == 0.0
    assert row_10['label_h2_t1'] == 0.0, "0대 < 1대 -> label 0"

    assert row_10['target_valid_h3'] == False, "H3 (13:00) 누락됨"
    assert pd.isna(row_10['label_h3_t1']), "미래 관측 부재 시 label NaN 보존"

    assert row_10['target_valid_h4'] == True, "H4 (14:00) 존재함"
    assert row_10['future_bike_count_h4'] == 5.0

if __name__ == '__main__':
    print("[Test Engine] Running test_labeling unit tests...")
    test_h1_h4_exact_labeling()
    print("[PASS] test_labeling unit tests passed 100%!")

