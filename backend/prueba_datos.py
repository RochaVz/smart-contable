# prueba_datos.py
from app.core.database import SessionLocal, engine, Base
from app.models.usuario import Usuario, RolUsuario
from app.models.empresa import Empresa, TipoPersona, RegimenFiscal
from app.core.security import hash_password

# 1. Crear TODAS las tablas
print("Creando tablas...")
Base.metadata.create_all(bind=engine)
print("Tablas creadas correctamente.")

db = SessionLocal()
# ... resto de tu código de creación de usuario y empresa ...

# 2. Crear un usuario de prueba (si no existe)
usuario = db.query(Usuario).filter(Usuario.email == "test@test.com").first()
if not usuario:
    usuario = Usuario(
        nombre="Contador Prueba",
        email="test@test.com",
        password_hash=hash_password("123456"),
        rol=RolUsuario.contador
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

# 3. Crear una empresa de prueba (si no existe)
empresa = db.query(Empresa).filter(Empresa.rfc == "AAA010101AAA").first()
if not empresa:
    empresa = Empresa(
        usuario_id=usuario.id,
        rfc="AAA010101AAA",
        razon_social="EMPRESA DE PRUEBAS SA DE CV",
        tipo_persona=TipoPersona.moral,
        regimen_fiscal=RegimenFiscal.general_de_ley
    )
    db.add(empresa)
    db.commit()
    db.refresh(empresa)

print(f"✅ ¡Datos creados! Tu empresa_id para las pruebas es: {empresa.id}")