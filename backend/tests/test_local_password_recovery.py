import pytest

from app.api.v1.endpoints.auth import recover_password
from app.core.exceptions import InvalidCredentialsException
from app.core.security import hash_password, verify_password
from app.core.config import settings
from app.schemas.usuario import PasswordResetRequest


class FakeQuery:
    def __init__(self, user):
        self.user = user

    def filter(self, *_):
        return self

    def first(self):
        return self.user


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.committed = False

    def query(self, *_):
        return FakeQuery(self.user)

    def commit(self):
        self.committed = True


class FakeUser:
    id = 1
    email = "usuario@example.com"
    activo = True
    password_hash = hash_password("old-password")


def test_recover_password_updates_password_with_valid_recovery_key(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_PASSWORD_RESET_KEY", "local-recovery-key")
    user = FakeUser()
    session = FakeSession(user)

    recover_password(
        PasswordResetRequest(
            email=user.email,
            recovery_key="local-recovery-key",
            new_password="new-password",
        ),
        session,
    )

    assert session.committed
    assert verify_password("new-password", user.password_hash)


def test_recover_password_rejects_invalid_recovery_key(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_PASSWORD_RESET_KEY", "local-recovery-key")

    with pytest.raises(InvalidCredentialsException):
        recover_password(
            PasswordResetRequest(
                email="usuario@example.com",
                recovery_key="invalid-key",
                new_password="new-password",
            ),
            FakeSession(None),
        )