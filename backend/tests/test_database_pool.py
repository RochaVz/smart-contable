from app.core.config import Settings


def test_database_pool_defaults_are_conservative_for_small_instances():
    settings = Settings(
        DATABASE_URL="mysql+pymysql://user:password@localhost/smart_contable",
        SECRET_KEY="test-database-pool-secret-key-12345",
    )

    assert settings.DATABASE_POOL_SIZE == 5
    assert settings.DATABASE_MAX_OVERFLOW == 0
    assert settings.DATABASE_POOL_TIMEOUT_SECONDS == 30