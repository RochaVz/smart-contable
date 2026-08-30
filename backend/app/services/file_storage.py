from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings


class FileStorageError(Exception):
    """Raised when a file cannot be persisted in object storage."""


def cfdi_object_key(empresa_id: int, uuid: str) -> str:
    return f"empresas/{empresa_id}/cfdi/{uuid}.xml"


def estado_cuenta_object_key(empresa_id: int, digest: str, extension: str) -> str:
    return f"empresas/{empresa_id}/estados-cuenta/{digest}{extension}"


class S3FileStorage:
    def __init__(self, bucket: str, region: str, client: Any | None = None):
        self.bucket = bucket
        self.client = client or boto3.client("s3", region_name=region)

    def upload(self, key: str, content: bytes, content_type: str) -> str:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        except (BotoCoreError, ClientError) as exc:
            raise FileStorageError("No se pudo almacenar el archivo original") from exc
        return key

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except (BotoCoreError, ClientError):
            pass


def get_file_storage() -> S3FileStorage | None:
    if not settings.S3_ENABLED:
        return None
    if not settings.S3_BUCKET:
        raise FileStorageError("S3_BUCKET es obligatorio cuando S3_ENABLED=true")
    return S3FileStorage(settings.S3_BUCKET, settings.AWS_REGION)