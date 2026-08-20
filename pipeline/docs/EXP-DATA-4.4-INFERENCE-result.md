# EXP-DATA-4.4 Model Inference Contract & Validation Result

## 1. Overview
This document specifies the input/output contract schema and verification results for pure model inference execution (`pipeline/src/modelops/inference.py`).

- **Artifact Policy**: The model binary `model_winner.joblib` is loaded locally from `output/model_winner.joblib` and is **not committed to Git**.
- **Branch**: `codex/w4-model-inference`
- **PR Target**: `codex/week4-model-integration`

---

## 2. Input / Output Schema Contract

### Input Schema
| Field | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `stationId` | `string` / `int` | Yes | Target station identifier | `"ST-101"` |
| `arrivalAt` | `string` (ISO-8601) | Yes | Target arrival timestamp | `"2026-08-19T14:00:00+09:00"` |
| `features` | `dict` | No | Feature values for prediction | `{"currentBikeCount": 5}` |

### Output Schema
| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `stationId` | `string` | Station identifier | `"ST-101"` |
| `arrivalAt` | `string` | Target arrival timestamp | `"2026-08-19T14:00:00+09:00"` |
| `availabilityLevel` | `string` / `null` | Level status: `HIGH`, `MEDIUM`, `LOW`, `SHORTAGE` | `"HIGH"` |
| `probability` | `float` / `null` | Predicted availability probability (0.0000 ~ 1.0000) | `0.8500` |
| `status` | `string` | Execution status: `SUCCESS` or `FAILED` | `"SUCCESS"` |
| `errorMessage` | `string` (optional) | Explicit error description when `status == FAILED` | `"Missing required key: 'stationId'"` |

---

## 3. Availability Level Mapping Rules

| Probability Range (`probability`) | `availabilityLevel` | Description |
| :--- | :--- | :--- |
| **0.75 <= p <= 1.00** | **`HIGH`** | High availability expected |
| **0.50 <= p < 0.75** | **`MEDIUM`** | Medium availability expected |
| **0.25 <= p < 0.50** | **`LOW`** | Low availability expected |
| **0.00 <= p < 0.25** | **`SHORTAGE`** | Shortage / Deficit expected |

---

## 4. Verification & Reproduction Command

### Test Execution Command
```bash
pytest pipeline/tests/test_model_inference.py -v
```

### Tested Test Scenarios (5/5 Passed)
1. **Normal Inference**: Valid inputs return `status: SUCCESS` with `availabilityLevel` and `probability`.
2. **Missing Input**: Missing `stationId` or `arrivalAt` yields `status: FAILED` with explicit error message.
3. **Type Error**: Invalid data types or malformed timestamps yield `status: FAILED`.
4. **Missing Artifact**: Non-existent model path yields `status: FAILED` with artifact missing error message.
5. **Reproducibility**: Identical inputs produce identical, deterministic prediction output contracts.

---

## 5. Known Limitations
- Real-time online inference depends on the local existence of `output/model_winner.joblib` or an injected predictor override.
- Feature alignment is strictly validated to reject non-numeric or unexpected payload structures.
