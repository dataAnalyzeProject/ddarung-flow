package com.ddarungflow.prediction;

/**
 * 예측 대상 시각의 지평(Horizon) 상태를 정의하는 Enum.
 */
public enum PredictionTimeStatus {
    /**
     * 정상 예측 가능 상태 (미래 horizon이 60, 120, 180, 240분 중 하나인 경우)
     */
    NORMAL,

    /**
     * 목표 정시가 요청 시각보다 과거이거나 같아서 예측하기에 너무 이른 상태
     */
    TOO_SOON,

    /**
     * 지원하지 않는 미래 지평 상태 (60, 120, 180, 240분 이외의 미래 시점)
     */
    UNAVAILABLE
}
