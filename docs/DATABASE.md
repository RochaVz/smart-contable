# Base de Datos

## Entidades Principales

### Usuario

Campos:

- id
- nombre
- email
- password_hash

---

### Empresa

Campos:

- id
- razon_social
- rfc

---

### Factura

Campos:

- id
- uuid
- fecha
- subtotal
- iva
- total

---

### Poliza

Campos:

- id
- numero
- fecha

---

### MovimientoPoliza

Campos:

- id
- cuenta
- cargo
- abono

---

### Conciliacion

Campos:

- id
- factura_id
- movimiento_bancario_id

---

## Convenciones

Todas las tablas:

- created_at
- updated_at