"""OCI Object Storage에 불변 Raw JSON을 저장한다."""

import json
import os

import oci

from pipeline.src.storage.local_raw_store import build_raw_record


def create_object_storage_client(auth_mode=None):
    """로컬 config 파일 또는 OCI Compute Instance Principal로 인증한다."""
    mode = (auth_mode or os.getenv("OCI_AUTH_MODE", "config_file")).lower()
    if mode == "config_file":
        config = oci.config.from_file(
            os.environ["OCI_CONFIG_FILE"],
            os.getenv("OCI_CONFIG_PROFILE", "DEFAULT"),
        )
        return oci.object_storage.ObjectStorageClient(config)
    if mode == "instance_principal":
        signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        return oci.object_storage.ObjectStorageClient(config={}, signer=signer)
    raise ValueError("OCI_AUTH_MODE must be 'config_file' or 'instance_principal'")


def write_raw_object_once(
    source,
    observed_at,
    collected_at,
    payload,
    bucket_name,
    client=None,
    prefix="raw",
):
    """동일 객체를 덮어쓰지 않고 OCI Object Storage에 한 번만 저장한다."""
    if not bucket_name:
        raise ValueError("OCI_BUCKET_NAME is required")
    relative_path, envelope = build_raw_record(
        source, observed_at, collected_at, payload
    )
    object_name = "/".join(
        part for part in (prefix.strip("/"), relative_path.as_posix()) if part
    )
    body = json.dumps(
        envelope, ensure_ascii=False, indent=2, sort_keys=True
    ).encode("utf-8") + b"\n"
    object_client = client or create_object_storage_client()
    namespace = object_client.get_namespace().data
    try:
        response = object_client.put_object(
            namespace,
            bucket_name,
            object_name,
            body,
            content_type="application/json",
            if_none_match="*",
        )
        return {
            "created": True,
            "bucket": bucket_name,
            "object_name": object_name,
            "etag": response.headers.get("etag"),
        }
    except oci.exceptions.ServiceError as exc:
        if exc.status == 412:
            return {
                "created": False,
                "bucket": bucket_name,
                "object_name": object_name,
                "etag": None,
            }
        raise
