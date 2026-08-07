import os
import json
import argparse
import pandas as pd
import numpy as np

def load_data_split_config(config_path=None):
    """
    data_split.json 경계 설정 파일을 읽어옵니다.
    """
    if not config_path:
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "data_split.json")
    
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "train_range": {"start_timestamp": "2024-01-01 00:00:00", "end_timestamp": "2025-05-14 23:00:00"},
        "holdout_test_range": {"start_timestamp": "2025-05-15 00:00:00", "end_timestamp": "2025-12-31 23:00:00"}
    }

def generate_h1_h4_labels(df_curated, config_path=None):
    """
    정제된 시계열 데이터에서 H1~H4 (60, 120, 180, 240분 뒤) exact matching을 수행하고
    valid 플래그 (target_valid_h1~h4) 및 필요 수량 1~5대 라벨 (label_hX_tY)을 생성합니다.
    """
    print("\n[Labeling Pipeline] H1~H4 라벨링 및 시계열 Split 시작...")

    df = df_curated.copy()
    if 'dt' not in df.columns:
        df['dt'] = pd.to_datetime(df['observed_at'])
    if 'st' not in df.columns:
        df['st'] = df['station_id']
    if 'bike_cnt' not in df.columns:
        df['bike_cnt'] = pd.to_numeric(df['bike_count'], errors='coerce')

    df = df.dropna(subset=['st', 'dt', 'bike_cnt']).sort_values(['st', 'dt']).reset_index(drop=True)

    df_res = pd.DataFrame({
        'station_id': df['st'],
        'feature_as_of': df['dt'],
        'current_bike_count': df['bike_cnt']
    })

    # H1(60m), H2(120m), H3(180m), H4(240m) 미래 매칭
    for h_step in [1, 2, 3, 4]:
        h_mins = h_step * 60
        df_future = df[['st', 'dt', 'bike_cnt']].copy()
        df_future['dt_target'] = df_future['dt'] - pd.Timedelta(hours=h_step)
        
        df_future_sub = df_future[['st', 'dt_target', 'dt', 'bike_cnt']].rename(columns={
            'dt': f'dt_future_h{h_step}',
            'bike_cnt': f'future_bike_count_h{h_step}'
        })

        merged = pd.merge(
            df_res[['station_id', 'feature_as_of']],
            df_future_sub,
            left_on=['station_id', 'feature_as_of'],
            right_on=['st', 'dt_target'],
            how='left'
        )

        df_res[f'prediction_target_at_h{h_step}'] = df_res['feature_as_of'] + pd.Timedelta(hours=h_step)
        df_res[f'future_bike_count_h{h_step}'] = merged[f'future_bike_count_h{h_step}']
        df_res[f'target_valid_h{h_step}'] = ~merged[f'future_bike_count_h{h_step}'].isnull()

        # 필요 수량 1~5대 라벨 생성 (target_valid_hX가 False인 경우 NaN 보존)
        for t in range(1, 6):
            col_name = f'label_h{h_step}_t{t}'
            future_cnts = merged[f'future_bike_count_h{h_step}']
            
            label_series = pd.Series(np.nan, index=df_res.index)
            valid_mask = ~future_cnts.isnull()
            label_series[valid_mask] = (future_cnts[valid_mask] >= t).astype(int)
            df_res[col_name] = label_series

    # 시계열 Split (Train vs Test Holdout) 지정 및 H4 경계 누출 차단
    cfg = load_data_split_config(config_path)
    train_end = pd.to_datetime(cfg['train_range']['end_timestamp'])
    test_start = pd.to_datetime(cfg['holdout_test_range']['start_timestamp'])

    def assign_split(dt):
        if dt <= train_end:
            return 'train'
        elif dt >= test_start:
            return 'test_holdout'
        else:
            return 'buffer_excluded'

    df_res['split'] = df_res['feature_as_of'].apply(assign_split)

    # 경계 누출 차단: Train 데이터 중 H4 미래 시각이 Test Start 범위를 넘어서는 경우 valid 플래그 차단
    leakage_mask = (df_res['split'] == 'train') & (df_res['prediction_target_at_h4'] >= test_start)
    if leakage_mask.sum() > 0:
        print(f"  - [Boundary Leakage Guard] H4 경계 누출 가능성 {leakage_mask.sum()}건 감지 ➡️ target_valid_h4 차단 조치 완료")
        df_res.loc[leakage_mask, 'target_valid_h4'] = False
        for t in range(1, 6):
            df_res.loc[leakage_mask, f'label_h4_t{t}'] = np.nan

    print(f"  - Labeled Dataset total rows: {len(df_res):,}행")
    print(f"  - Train rows: {(df_res['split'] == 'train').sum():,}행")
    print(f"  - Test Holdout rows: {(df_res['split'] == 'test_holdout').sum():,}행")

    return df_res

def run_labeling_pipeline(curated_csv_path="output/curated_inventory.csv", output_dir="output", config_path=None):
    """
    Curated inventory CSV 파일에서 H1~H4 라벨링 및 시계열 Split 데이터셋 생성
    """
    if not os.path.exists(curated_csv_path):
        raise FileNotFoundError(f"[Labeling Error] Curated CSV 파일이 없습니다: {curated_csv_path}")

    df_curated = pd.read_csv(curated_csv_path)
    df_labeled = generate_h1_h4_labels(df_curated, config_path=config_path)

    os.makedirs(output_dir, exist_ok=True)
    df_labeled.to_csv(os.path.join(output_dir, "labeled_dataset.csv"), index=False, encoding='utf-8-sig')
    
    # H1~H4 및 1~5대 정산 요약표 출력
    summary_rows = []
    for h in [1, 2, 3, 4]:
        val_cnt = int(df_labeled[f'target_valid_h{h}'].sum())
        total_cnt = len(df_labeled)
        rate = round((val_cnt / total_cnt) * 100, 2)
        
        t_rates = {}
        for t in range(1, 6):
            succ = int((df_labeled[f'label_h{h}_t{t}'] == 1).sum())
            t_rates[f't{t}_success_rate'] = round((succ / val_cnt) * 100, 2) if val_cnt > 0 else 0.0

        summary_rows.append({
            'horizon': f'H{h}',
            'minutes': h * 60,
            'valid_count': val_cnt,
            'total_base': total_cnt,
            'presence_rate': rate,
            **t_rates
        })

    df_summary = pd.DataFrame(summary_rows)
    df_summary.to_csv(os.path.join(output_dir, "labeling_summary.csv"), index=False, encoding='utf-8-sig')

    print(f"\n[Labeling Summary Table]\n{df_summary.to_string()}")
    return df_labeled, df_summary

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="DATA-2.1 H1~H4 Labeling Pipeline")
    parser.add_argument("--curated-csv", type=str, default="output/curated_inventory.csv", help="Path to curated inventory CSV")
    parser.add_argument("--output-dir", type=str, default="output", help="Path to output directory")
    parser.add_argument("--config", type=str, default=None, help="Path to data_split.json config")
    args = parser.parse_args()

    run_labeling_pipeline(curated_csv_path=args.curated_csv, output_dir=args.output_dir, config_path=args.config)
