# W4-MODEL-inference-repro-result

## 1. Execution Evidence Summary

| Field | Value |
| :--- | :--- |
| **Artifact SHA-256** | `e5e69d406c4581db05cfcb4f4463543e0f2da2809d36a00bd8453de75402ead6` |
| **Manifest SHA-256** | `a89c9687e1485ee42cf956b6fbcf2b5a5b512e0220268579471e4389ad3833b7` |
| **Execution Timestamp** | `2026-08-19T12:53:00+09:00` |
| **Input Row Count** | `2` |
| **Output Row Count** | `40` |
| **20 Combinations Generated** | `TRUE` |
| **Overall Verdict** | **`PASS`** |

---

## 2. Validation & Reproducibility Notes
- **Trusted Predictor Validation**: `build_trusted_predictor` verified SHA-256 checksum and exact required feature column order before running `predict_proba`.
- **Failure Guards**: Artifact missing, SHA-256 mismatch, and missing feature columns produce explicit `RuntimeError` or `publishable=False`.
- **Feature Isolation**: Future and route fields (`user_latitude`, `origin`, `destination`, `distance_meters`, `duration_seconds`, `future_bike_count`, etc.) are strictly forbidden and excluded from inference features.
