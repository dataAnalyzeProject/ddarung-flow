"""Idempotently persist an evaluated performance snapshot."""
import re
def publish_performance_run(connection, run):
    sha = run.get("artifactSha256")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha): raise ValueError("artifactSha256 must be lowercase SHA-256")
    payload = {key: value for key, value in run.items() if key not in ("artifactSha256", "modelVersion", "generatedAt")}
    cursor = connection.cursor()
    try:
        cursor.execute("""INSERT INTO model_performance_runs (artifact_sha256, model_version, generated_at, payload) VALUES (%s, %s, %s, %s::jsonb) ON CONFLICT (artifact_sha256, generated_at) DO UPDATE SET model_version=EXCLUDED.model_version, payload=EXCLUDED.payload""", (sha, run["modelVersion"], run["generatedAt"], __import__("json").dumps(payload)))
        connection.commit()
    except Exception:
        connection.rollback(); raise
    finally: cursor.close()
