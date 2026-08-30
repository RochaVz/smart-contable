from app.services.file_storage import (
    S3FileStorage,
    cfdi_object_key,
    estado_cuenta_object_key,
)


class FakeS3Client:
    def __init__(self):
        self.put_calls = []

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)


def test_s3_storage_uploads_encrypted_object():
    client = FakeS3Client()
    storage = S3FileStorage("smartcontable-files", "us-east-2", client=client)

    key = storage.upload("empresas/7/cfdi/uuid.xml", b"<xml/>", "application/xml")

    assert key == "empresas/7/cfdi/uuid.xml"
    assert client.put_calls == [{
        "Bucket": "smartcontable-files",
        "Key": "empresas/7/cfdi/uuid.xml",
        "Body": b"<xml/>",
        "ContentType": "application/xml",
        "ServerSideEncryption": "AES256",
    }]


def test_s3_keys_are_isolated_by_empresa():
    assert cfdi_object_key(7, "uuid") == "empresas/7/cfdi/uuid.xml"
    assert estado_cuenta_object_key(7, "digest", ".pdf") == (
        "empresas/7/estados-cuenta/digest.pdf"
    )