import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.models.usuario import Usuario
from app.core.security import hash_password

# Usar SQLite en memoria para tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture
def db():
    db = TestingSessionLocal()
    yield db
    db.close()


class TestAuth:
    """Tests para autenticación"""

    def test_registro_exitoso(self):
        """Test: Registrar usuario nuevo"""
        response = client.post(
            "/api/v1/auth/registro",
            json={
                "nombre": "Test User",
                "email": "test@example.com",
                "password": "SecurePassword123",
                "rol": "contador"
            }
        )
        assert response.status_code == 201
        assert response.json()["status"] == "success"
        assert response.json()["data"]["email"] == "test@example.com"

    def test_registro_email_duplicado(self, db):
        """Test: Registrar con email duplicado"""
        usuario_existente = Usuario(
            nombre="Existing",
            email="existing@example.com",
            password_hash=hash_password("Password123"),
            rol="contador"
        )
        db.add(usuario_existente)
        db.commit()

        response = client.post(
            "/api/v1/auth/registro",
            json={
                "nombre": "Otro",
                "email": "existing@example.com",
                "password": "Password123",
                "rol": "contador"
            }
        )
        assert response.status_code == 409
        assert "duplicado" in response.json()["detail"].lower()

    def test_login_exitoso(self, db):
        """Test: Login correcto"""
        usuario = Usuario(
            nombre="Test",
            email="login-success@example.com",
            password_hash=hash_password("Password123"),
            rol="contador"
        )
        db.add(usuario)
        db.commit()

        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "login-success@example.com",
                "password": "Password123"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "access_token" in data["data"]

    def test_login_credenciales_invalidas(self):
        """Test: Login con credenciales incorrectas"""
        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "noexiste@example.com",
                "password": "WrongPassword"
            }
        )
        assert response.status_code == 401
        assert "Credenciales" in response.json()["detail"]

    def test_login_usuario_inactivo(self, db):
        """Test: Login con usuario desactivado"""
        usuario = Usuario(
            nombre="Inactive",
            email="inactive@example.com",
            password_hash=hash_password("Password123"),
            rol="contador",
            activo=False
        )
        db.add(usuario)
        db.commit()

        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "inactive@example.com",
                "password": "Password123"
            }
        )
        assert response.status_code == 403
        assert "desactivado" in response.json()["detail"].lower()


class TestHealth:
    """Tests para health check"""

    def test_health_ok(self):
        """Test: Health check exitoso"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"]["database"] == "ok"

    def test_root_endpoint(self):
        """Test: Root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "version" in data["data"]


class TestConfig:
    """Tests para configuración"""

    def test_config_debug_false(self):
        """Test: DEBUG debe ser False por default"""
        from app.core.config import settings
        assert settings.DEBUG == False

    def test_config_secret_key_length(self):
        """Test: SECRET_KEY debe tener longitud mínima"""
        from app.core.config import settings
        assert len(settings.SECRET_KEY) >= 32
