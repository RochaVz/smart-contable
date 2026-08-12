"""corregir contrapartida ingresos a baucher

Revision ID: c3f84a91d2aa
Revises: 9b2ad1e77c31
Create Date: 2026-08-11

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "c3f84a91d2aa"
down_revision = "9b2ad1e77c31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tarjeta: contrapartida Clientes -> Baucher
    op.execute(
        """
        UPDATE movimientos_poliza mp
        JOIN polizas p ON p.id = mp.poliza_id
        JOIN facturas f ON f.id = p.factura_id
        SET
            mp.cuenta = '102.02.01',
            mp.nombre_cuenta = 'Baucher',
            mp.concepto = 'Contrapartida de cobro por tarjeta'
        WHERE
            p.tipo = 'ingreso'
            AND mp.cuenta = '105.01.01'
            AND f.forma_pago IN ('04', '28', '29')
        """
    )

    # Efectivo / cheque: contrapartida Clientes -> Depositos en efectivo
    op.execute(
        """
        UPDATE movimientos_poliza mp
        JOIN polizas p ON p.id = mp.poliza_id
        JOIN facturas f ON f.id = p.factura_id
        SET
            mp.cuenta = '102.03.01',
            mp.nombre_cuenta = 'Depositos en efectivo',
            mp.concepto = 'Contrapartida de cobro por efectivo/cheque'
        WHERE
            p.tipo = 'ingreso'
            AND mp.cuenta = '105.01.01'
            AND f.forma_pago IN ('01', '02')
        """
    )


def downgrade() -> None:
    # Reversión genérica a Clientes para restaurar estado previo.
    op.execute(
        """
        UPDATE movimientos_poliza mp
        JOIN polizas p ON p.id = mp.poliza_id
        SET
            mp.cuenta = '105.01.01',
            mp.nombre_cuenta = 'Clientes',
            mp.concepto = 'Cancelación de CxC por cobro con tarjeta'
        WHERE
            p.tipo = 'ingreso'
            AND mp.cuenta IN ('102.02.01', '102.03.01')
        """
    )
