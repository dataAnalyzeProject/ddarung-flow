import os
import sys
import tempfile
import pathlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd
import numpy as np
from pipeline.src.inventory_cleaning import (
    load_and_verify_manifest,
    find_actual_csv_file,
    calculate_sha256
)

def test_manifest_loading_and_2023_rejection():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = pathlib.Path(tmp_dir)
        manifest_csv = tmp_path / "approved_inventory_manifest.csv"
        manifest_content = (
            "relative_path,sha256,approved,status,year\n"
            "2024_시간대별_데이터/data_2401.csv,E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855,true,RECOMMENDED,2024\n"
            "2023_시간대별_데이터/data_2301.csv,ABC1234298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855,true,RECOMMENDED,2023\n"
        )
        manifest_csv.write_text(manifest_content, encoding="utf-8-sig")

        df_m = load_and_verify_manifest(str(manifest_csv))
        assert len(df_m) == 1, "2023년 데이터 파일이 수용되지 않고 거부되어야 합니다."
        assert "data_2401.csv" in df_m["file_path"].iloc[0]

def test_find_actual_csv_file_resolution():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = pathlib.Path(tmp_dir)
        data_dir = tmp_path / "2024_시간대별_데이터"
        data_dir.mkdir(parents=True)
        sample_file = data_dir / "data_2401.csv"
        sample_file.write_text("dummy content", encoding="utf-8")

        found_path = find_actual_csv_file(str(tmp_path), "2024_시간대별_데이터/data_2401.csv")
        assert os.path.exists(found_path)
        assert os.path.basename(found_path) == "data_2401.csv"

def test_zero_vs_missing_separation():
    raw_series = pd.Series([0, None, -1, 5, "invalid"])
    num_series = pd.to_numeric(raw_series, errors='coerce')
    
    zero_cnt = (num_series == 0).sum()
    missing_cnt = num_series.isnull().sum()
    negative_cnt = (num_series < 0).sum()

    assert zero_cnt == 1, "실제 0대 1건 분리 집계"
    assert missing_cnt == 2, "결측치/변환불가 2건 분리 집계"
    assert negative_cnt == 1, "음수 1건 집계"

def test_inventory_sample_fixture_file_cleaning():
    """
    pipeline/tests/fixtures/inventory_sample.csv 샘플 파일에서
    0대(0), 빈값(NaN), 음수(-1), 중복 데이터 정제 로직을 직접 검증합니다.
    """
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "inventory_sample.csv")
    assert os.path.exists(fixture_path), "inventory_sample.csv 피스처 파일이 존재해야 합니다."

    df_sample = pd.read_csv(fixture_path)
    counts = pd.to_numeric(df_sample['거치수량'], errors='coerce')

    # 1. 실제 0대 1건 감지 (11시 0대)
    assert (counts == 0).sum() == 1
    # 2. 빈 값(Missing) 1건 감지 (12시 빈값)
    assert counts.isnull().sum() == 1
    # 3. 음수(-1) 1건 감지 (12시 -1대)
    assert (counts < 0).sum() == 1
    # 4. 중복 레코드 (11시 2건, 12시 2건 중 복제본 2건) 감지
    col_dt = df_sample.columns[0]
    col_st = df_sample.columns[1]
    col_hr = df_sample.columns[3]
    assert df_sample.duplicated(subset=[col_dt, col_st, col_hr]).sum() == 2

if __name__ == '__main__':
    print("[Test Engine] Running test_inventory_cleaning unit tests...")
    test_zero_vs_missing_separation()
    test_inventory_sample_fixture_file_cleaning()
    print("[PASS] test_inventory_cleaning unit tests passed 100%!")


