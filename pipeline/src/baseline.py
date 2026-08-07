import os
import argparse
import pandas as pd
import numpy as np

def calculate_brier_score(y_true, y_prob):
    """
    Brier Score (Mean Squared Error for probability predictions) 연산
    """
    return np.mean((y_prob - y_true) ** 2)

def calculate_deficit_recall(y_true, y_prob, threshold_prob=0.5):
    """
    부족 (Deficit; y_true == 0) 감지 Recall 연산
    y_true == 0 인 실제 부족 상황에서, 모델이 부족(y_prob < threshold_prob)으로 적절히 감지했는지 비율
    """
    actual_deficits = (y_true == 0)
    if actual_deficits.sum() == 0:
        return 0.0
    predicted_deficits = (y_prob < threshold_prob)
    return np.sum(actual_deficits & predicted_deficits) / np.sum(actual_deficits)

def calculate_calibration_error(y_true, y_prob, num_bins=10):
    """
    Expected Calibration Error (ECE; 예측 확률과 실제 발생 빈도 간 절대 오차) 연산
    """
    bin_boundaries = np.linspace(0, 1, num_bins + 1)
    ece = 0.0
    total_n = len(y_true)
    if total_n == 0:
        return 0.0

    for i in range(num_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]
        
        in_bin = (y_prob >= bin_lower) & (y_prob < bin_upper) if i < num_bins - 1 else (y_prob >= bin_lower) & (y_prob <= bin_upper)
        prop_in_bin = np.mean(in_bin)
        
        if prop_in_bin > 0:
            accuracy_in_bin = np.mean(y_true[in_bin])
            avg_confidence_in_bin = np.mean(y_prob[in_bin])
            ece += np.abs(accuracy_in_bin - avg_confidence_in_bin) * prop_in_bin

    return ece

def calculate_accuracy(y_true, y_prob, threshold_prob=0.5):
    """
    이진 분류 정확도 (Accuracy) 연산
    """
    y_pred = (y_prob >= threshold_prob).astype(int)
    return np.mean(y_true == y_pred)

def evaluate_baseline_models(df_labeled, output_dir="output"):
    """
    지속성(Persistence) 및 과거 통계(Historical Mean) 베이스라인 모델을 구축하고
    동일 2025 Holdout Test Set에서 2022 포함/제외 대조 4대 지표(Brier, Recall, Calibration, Accuracy)를 평가합니다.
    """
    print("\n[Baseline Pipeline] 지속성·통계 베이스라인 모델 평가 시작...")
    os.makedirs(output_dir, exist_ok=True)

    df_test = df_labeled[df_labeled['split'] == 'test_holdout'].copy()
    df_train = df_labeled[df_labeled['split'] == 'train'].copy()

    if len(df_test) == 0:
        print("  - [Warning] Test Holdout 데이터가 존재하지 않아 전체 데이터셋에서 평가를 진행합니다.")
        df_test = df_labeled.copy()

    df_test['dt'] = pd.to_datetime(df_test['feature_as_of'])
    df_test['dayofweek'] = df_test['dt'].dt.dayofweek
    df_test['hour'] = df_test['dt'].dt.hour

    df_train['dt'] = pd.to_datetime(df_train['feature_as_of'])
    df_train['dayofweek'] = df_train['dt'].dt.dayofweek
    df_train['hour'] = df_train['dt'].dt.hour

    eval_rows = []
    summary_metrics = []

    for variant in ['exclude_2022', 'include_2022']:
        print(f"\n  === Training Variant: {variant} ===")

        # exclude_2022일 때는 2024년 1월 1일 이후 데이터만 학습에 사용
        if variant == 'exclude_2022':
            df_train_variant = df_train[df_train['dt'] >= '2024-01-01'].copy()
        else:
            df_train_variant = df_train.copy()

        for h_step in [1, 2, 3, 4]:
            h_mins = h_step * 60
            val_mask = df_test[f'target_valid_h{h_step}'] == True
            sub_test = df_test[val_mask].copy()

            if len(sub_test) == 0:
                continue

            for t in range(1, 6):
                col_label = f'label_h{h_step}_t{t}'
                y_true = sub_test[col_label].values.astype(int)

                # 1. 지속성 모델 (Persistence Model)
                # 현재 자전거 대수 >= 필요 수량 t 이면 1.0, 아니면 0.0
                pers_prob = (sub_test['current_bike_count'].values >= t).astype(float)

                # 2. 과거 통계 모델 (Historical Mean Model)
                # (station_id, dayofweek, hour) 그룹별 과거 평균 대여 성공률
                stat_group = df_train_variant.groupby(['station_id', 'dayofweek', 'hour'])[col_label].mean().reset_index()
                stat_group = stat_group.rename(columns={col_label: 'stat_prob'})

                stat_merged = pd.merge(
                    sub_test[['station_id', 'dayofweek', 'hour']],
                    stat_group,
                    on=['station_id', 'dayofweek', 'hour'],
                    how='left'
                )

                # 누락된 그룹은 전체 평균값으로 대체
                global_mean = df_train_variant[col_label].mean() if len(df_train_variant) > 0 else 0.5
                stat_prob = stat_merged['stat_prob'].fillna(global_mean).values

                # 지표 산출: Persistence Model
                p_brier = calculate_brier_score(y_true, pers_prob)
                p_recall = calculate_deficit_recall(y_true, pers_prob)
                p_calib = calculate_calibration_error(y_true, pers_prob)
                p_acc = calculate_accuracy(y_true, pers_prob)

                # 지표 산출: Historical Statistical Model
                s_brier = calculate_brier_score(y_true, stat_prob)
                s_recall = calculate_deficit_recall(y_true, stat_prob)
                s_calib = calculate_calibration_error(y_true, stat_prob)
                s_acc = calculate_accuracy(y_true, stat_prob)

                summary_metrics.append({
                    'training_variant': variant,
                    'horizon_minutes': h_mins,
                    'required_bike_count': t,
                    'sample_count': len(y_true),
                    'persistence_brier_score': round(p_brier, 4),
                    'persistence_deficit_recall': round(p_recall, 4),
                    'persistence_calibration_error': round(p_calib, 4),
                    'persistence_accuracy': round(p_acc, 4),
                    'statistical_brier_score': round(s_brier, 4),
                    'statistical_deficit_recall': round(s_recall, 4),
                    'statistical_calibration_error': round(s_calib, 4),
                    'statistical_accuracy': round(s_acc, 4)
                })

    df_metrics = pd.DataFrame(summary_metrics)
    df_metrics.to_csv(os.path.join(output_dir, "baseline_metrics_summary.csv"), index=False, encoding='utf-8-sig')

    print(f"\n[Baseline Metrics Summary]\n{df_metrics.head(20).to_string()}")
    return df_metrics

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="DATA-2.1 Baseline Evaluation Pipeline")
    parser.add_argument("--labeled-csv", type=str, default="output/labeled_dataset.csv", help="Path to labeled dataset CSV")
    parser.add_argument("--output-dir", type=str, default="output", help="Path to output directory")
    args = parser.parse_args()

    if os.path.exists(args.labeled_csv):
        df_labeled = pd.read_csv(args.labeled_csv)
        evaluate_baseline_models(df_labeled, output_dir=args.output_dir)
    else:
        print(f"[Baseline Pipeline] '{args.labeled_csv}' 파일이 아직 존재하지 않습니다. 먼저 inventory_cleaning.py & labeling.py를 구동하세요.")
