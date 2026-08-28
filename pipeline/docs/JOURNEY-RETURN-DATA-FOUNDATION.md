# Journey return data foundation

This fixture-only foundation implements the contracts in `JOURNEY-DATA-04` and
`RETURN-MODEL-05`.  It does not collect private data, write Parquet, fit a
production model, or report model performance.

## Capacity history contract

`build_capacity_history(station_master_snapshots)` accepts source snapshots:

```python
{
    "station_id": "ST-0001",
    "capacity": 20,
    "as_of": "2026-08-28T00:00:00Z",
    "source": "seoul-station-master",
    "source_as_of": "2026-08-28T00:00:00Z",
}
```

It returns records with `station_id`, `capacity`, `valid_from`, `valid_to`,
`source`, and `source_as_of`.  Each interval is half-open:
`valid_from <= target_at < valid_to`; the newest snapshot has `valid_to=None`.
The function rejects two snapshots for one station at the same `as_of` instead
of selecting one.

`resolve_capacity_as_of(capacity_history, station_id, target_at)` returns one
matching capacity plus provenance, or a `reason_code`.  A current master is
never supplied as a historical fallback.

## Labels and quarantine

`build_return_labels(target_rows, future_observations, capacity_history)`
returns `{"labels": [...], "quarantine": [...]}`.  Targets are
`station_id` + `target_at`; future observations are `station_id` +
`observed_at` + `bike_count`.  It produces five rows per valid target, one for
each `required_empty_dock_count` in 1..5.

```text
actual_empty_dock_count = capacity_as_of - future_bike_count
return_available = 1 if actual_empty_dock_count >= required_empty_dock_count else 0
```

`future_bike_count=0` is a valid observation.  Missing records remain missing;
they are never converted to zero.  Over-capacity bike counts are quarantined,
not clamped.  When a target lacks both a capacity and a future observation, the
capacity reason is emitted first because label construction cannot proceed to
the observation join.

| Reason code | Meaning |
| --- | --- |
| `STATION_UNMATCHED` | No capacity-history record exists for the station. |
| `CAPACITY_MISSING` | The station exists but no interval covers `target_at`. |
| `INVALID_CAPACITY` | The covering interval has a non-positive/non-integer capacity or invalid provenance. |
| `CAPACITY_CONFLICT` | More than one valid interval covers the target. |
| `FUTURE_OBSERVATION_MISSING` | No exact future observation exists at `target_at`. |
| `BIKE_COUNT_EXCEEDS_CAPACITY` | Future bike count exceeds the resolved capacity. |

## Baseline skeletons

- `predict_persistence_baseline(examples)` uses current empty docks as the
  future state and returns `0.0` or `1.0` without clamping invalid counts.
- `fit_station_time_baseline(examples)` fits a station × weekday × time-bucket
  rate from rows whose `split` is exactly `train`; validation and test rows are
  ignored. `predict_station_time_baseline(model, examples)` returns `None` for
  an unseen group rather than inventing a probability.

All public outputs are sorted by station, time, and required empty dock count,
so equivalent input order and repeated executions return identical results.
