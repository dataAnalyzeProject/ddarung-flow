"""Idempotently persist a validated model performance snapshot."""
import json
import re

def publish_performance_run(connection, run):
    sha = run.get("artifactSha256")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha): raise ValueError("artifactSha256 must be lowercase SHA-256")
    if not run.get("modelVersion") or not run.get("generatedAt"): raise ValueError("modelVersion and generatedAt are required")
    if not isinstance(run.get("combinations"), list) or len(run["combinations"]) != 20: raise ValueError("expected exactly 20 combinations")
    payload = {key: value for key, value in run.items() if key not in ("artifactSha256", "modelVersion", "generatedAt")}
    cursor = connection.cursor()
    try:
        cursor.execute("""INSERT INTO model_performance_runs (artifact_sha256, model_version, generated_at, payload) VALUES (%s, %s, %s, %s::jsonb) ON CONFLICT (artifact_sha256, generated_at) DO UPDATE SET model_version = EXCLUDED.model_version, payload = EXCLUDED.payload""", (sha, run["modelVersion"], run["generatedAt"], json.dumps(payload)))
        connection.commit()
    except Exception:
        connection.rollback(); raise
    finally: cursor.close()
