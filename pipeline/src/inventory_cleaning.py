import os
import sys
import glob
import hashlib
import argparse
import pandas as pd
import numpy as np

def calculate_sha256(file_path):
    """
    파일의 SHA-256 64자리 대문자 헥사 해시값을 연산합니다.
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(8192 * 1024), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest().upper()

def resolve_default_data_root():
    """
    데이터셋 루트 디렉토리를 탐색합니다.
    """
    candidates = [
        r"C:\Users\M\Desktop\데이터셋",
        os.path.join(os.path.expanduser("~"), "Desktop", "데이터셋"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

def resolve_default_manifest(data_root):
    """
    approved_inventory_manifest.csv 파일 경로를 탐색합니다.
    """
    candidates = [
        os.path.join(data_root, "approved_inventory_manifest.csv"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "DATA-2.0-output", "approved_inventory_manifest.csv"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "approved_inventory_manifest.csv")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]

def load_and_verify_manifest(manifest_path):
    """
    승인 Manifest CSV 파일을 검증하고 로드합니다.
    필수 열: file_path (또는 relative_path), sha256, approved, status (또는 file_policy), year
    """
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"[Manifest Error] Manifest 파일이 존재하지 않습니다: {manifest_path}")

    df_manifest = pd.read_csv(manifest_path)
    
    # 컬럼 호환성 표준화
    col_map = {
        'relative_path': 'file_path',
        'status': 'file_policy'
    }
    for old_c, new_c in col_map.items():
        if old_c in df_manifest.columns and new_c not in df_manifest.columns:
            df_manifest[new_c] = df_manifest[old_c]

    required_cols = ['file_path', 'sha256', 'approved']
    for rc in required_cols:
        if rc not in df_manifest.columns:
            raise ValueError(f"[Manifest Error] 누락된 필수 열: {rc}")

    # 2023년 데이터는 연도 계약에 따라 거부
    if 'year' in df_manifest.columns:
        df_manifest = df_manifest[~df_manifest['year'].astype(str).str.contains('2023')].copy()

    return df_manifest

def find_actual_csv_file(data_root, file_path_str):
    """
    data-root 아래에서 manifest의 파일명으로 실제 CSV 파일을 탐색합니다.
    동일 파일명이 0개이거나 2개 이상이면 에러를 발생시킵니다.
    """
    base_name = os.path.basename(file_path_str)
    
    # 1. exact relative path match
    exact_path = os.path.join(data_root, file_path_str)
    if os.path.exists(exact_path):
        return exact_path

    # 2. recursive search under data_root
    matches = glob.glob(os.path.join(data_root, "**", base_name), recursive=True)
    if len(matches) == 0:
        raise FileNotFoundError(f"[File Resolution Error] '{base_name}' 파일을 '{data_root}' 하위에서 찾을 수 없습니다. (0개 감지)")
    elif len(matches) > 1:
        raise ValueError(f"[File Resolution Error] '{base_name}' 파일이 '{data_root}' 하위에서 2개 이상 중복 감지되었습니다 ({len(matches)}개): {matches}")
    
    return matches[0]

def clean_inventory_dataset(manifest_path=None, data_root=None, output_dir="output"):
    """
    승인 Manifest 및 SHA-256 검증 기반 데이터 정제 및 Curated/Quarantine 분리 수행
    """
    if not data_root:
        data_root = resolve_default_data_root()
    if not manifest_path:
        manifest_path = resolve_default_manifest(data_root)

    print(f"[Inventory Cleaning] Data Root: {data_root}")
    print(f"[Inventory Cleaning] Manifest Path: {manifest_path}")

    df_manifest = load_and_verify_manifest(manifest_path)
    os.makedirs(output_dir, exist_ok=True)

    curated_records = []
    quarantine_records = []
    reconciliation_rows = []

    for idx, row in df_manifest.iterrows():
        rel_path = str(row['file_path'])
        expected_sha = str(row['sha256']).strip().upper()
        is_approved = str(row.get('approved', 'true')).strip().lower() in ['true', '1', 't', 'y', 'yes']
        policy = str(row.get('file_policy', 'RECOMMENDED')).upper()

        if not is_approved or 'EXCLUDED' in policy or '2407' in rel_path or '2408' in rel_path:
            print(f"  - [EXCLUDED SKIP] {rel_path} (정책: {policy})")
            continue

        actual_file = find_actual_csv_file(data_root, rel_path)
        actual_sha = calculate_sha256(actual_file)

        if actual_sha != expected_sha:
            raise ValueError(f"[SHA-256 Mismatch Error] '{rel_path}' 해시 불일치!\n  Actual:   {actual_sha}\n  Expected: {expected_sha}")
        
        print(f"  - [SHA-256 VERIFIED PASS] {os.path.basename(actual_file)}")

        # CSV 데이터 로드 (Header 및 encodings 처리)
        try:
            df_raw = pd.read_csv(actual_file, encoding='cp949')
        except Exception:
            df_raw = pd.read_csv(actual_file, encoding='utf-8-sig')

        # 컬럼 표준화
        if len(df_raw.columns) >= 5:
            df_raw = df_raw.rename(columns={
                df_raw.columns[0]: 'observed_date',
                df_raw.columns[1]: 'station_id',
                df_raw.columns[2]: 'station_name',
                df_raw.columns[3]: 'hour',
                df_raw.columns[4]: 'bike_count'
            })

        raw_count = len(df_raw)

        # datetime 생성
        df_raw['observed_at'] = pd.to_datetime(
            df_raw['observed_date'].astype(str) + ' ' + df_raw['hour'].astype(str) + ':00:00',
            errors='coerce'
        )

        # bike_count 수치화 및 0/Missing 분리
        df_raw['raw_bike_count'] = df_raw['bike_count']
        df_raw['numeric_bike_count'] = pd.to_numeric(df_raw['bike_count'], errors='coerce')
        
        # 0대 재고와 Missing/Null 구분
        df_raw['is_zero'] = df_raw['numeric_bike_count'] == 0
        df_raw['is_missing'] = df_raw['numeric_bike_count'].isnull()
        df_raw['is_negative'] = df_raw['numeric_bike_count'] < 0

        # 중복 및 상충 키 격리 (Quarantine)
        # 동일 대여소 + 동일 시각 그룹화
        valid_rows = df_raw[~df_raw['is_missing'] & ~df_raw['is_negative']].copy()
        
        # 상충 키 (같은 대여소·시각에 서로 다른 bike_count 존재)
        conflict_keys = valid_rows.groupby(['station_id', 'observed_at'])['numeric_bike_count'].nunique()
        isolated_keys_set = set(conflict_keys[conflict_keys > 1].index)

        def is_conflict(r):
            return (r['station_id'], r['observed_at']) in isolated_keys_set

        conflict_mask = valid_rows.apply(is_conflict, axis=1) if len(isolated_keys_set) > 0 else pd.Series(False, index=valid_rows.index)
        
        df_quarantine_sub = valid_rows[conflict_mask].copy()
        df_clean_sub = valid_rows[~conflict_mask].copy()

        # 단순 중복 제거
        dups_count = len(df_clean_sub) - len(df_clean_sub.drop_duplicates(subset=['station_id', 'observed_at']))
        df_clean_sub = df_clean_sub.drop_duplicates(subset=['station_id', 'observed_at'])

        curated_records.append(df_clean_sub)
        if len(df_quarantine_sub) > 0:
            quarantine_records.append(df_quarantine_sub)

        reconciliation_rows.append({
            'file_name': os.path.basename(actual_file),
            'raw_rows': raw_count,
            'clean_rows': len(df_clean_sub),
            'quarantine_rows': len(df_quarantine_sub),
            'duplicate_removed': dups_count,
            'zero_count': int(df_raw['is_zero'].sum()),
            'missing_count': int(df_raw['is_missing'].sum())
        })

    df_curated = pd.concat(curated_records, ignore_index=True) if curated_records else pd.DataFrame()
    df_quarantine = pd.concat(quarantine_records, ignore_index=True) if quarantine_records else pd.DataFrame()
    df_recon = pd.DataFrame(reconciliation_rows)

    # 결과 CSV 출력
    df_curated.to_csv(os.path.join(output_dir, "curated_inventory.csv"), index=False, encoding='utf-8-sig')
    df_quarantine.to_csv(os.path.join(output_dir, "quarantine_inventory.csv"), index=False, encoding='utf-8-sig')
    df_recon.to_csv(os.path.join(output_dir, "row_reconciliation_summary.csv"), index=False, encoding='utf-8-sig')

    print(f"\n[Inventory Cleaning Result]")
    print(f"  - Curated Clean Rows: {len(df_curated):,}행")
    print(f"  - Quarantine Rows: {len(df_quarantine):,}행")
    print(f"  - Reconciliation Summary:\n{df_recon.to_string()}")

    return df_curated, df_quarantine, df_recon

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="DATA-2.1 Inventory Cleaning Pipeline")
    parser.add_argument("--manifest", type=str, default=None, help="Path to approved inventory manifest CSV")
    parser.add_argument("--data-root", type=str, default=None, help="Path to raw dataset root directory")
    parser.add_argument("--output-dir", type=str, default="output", help="Path to output directory")
    args = parser.parse_args()

    clean_inventory_dataset(manifest_path=args.manifest, data_root=args.data_root, output_dir=args.output_dir)
