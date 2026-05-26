from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database.database import get_db
from backend.models.models import MensajeContacto, RolUsuario
from backend.schemas.schemas import ContactoCreate, ContactoResponse, ConversionDivisaResponse
from backend.services.auth_service import require_roles
from backend.services.divisa_service import convertir_a_clp
from typing import List

# ─── DIVISAS ────────────────────────────────────────────────────────────────
router_divisas = APIRouter(prefix="/divisas", tags=["Divisas"])

@router_divisas.get("/convertir", response_model=ConversionDivisaResponse)
async def convertir_divisa(
    monto: float = Query(gt=0, description="Monto en moneda origen"),
    moneda: str = Query(description="Código de moneda: USD, EUR, GBP"),
):
    """
    Convierte un monto en moneda extranjera a CLP usando la API del Banco Central de Chile.
    Útil para clientes internacionales que realizan pedidos desde el extranjero.
    """
    try:
        resultado = await convertir_a_clp(monto, moneda)
        return ConversionDivisaResponse(**resultado)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router_divisas.get("/tipos-cambio", tags=["Divisas"])
async def tipos_cambio_disponibles():
    """Retorna los tipos de cambio actuales disponibles."""
    from backend.services.divisa_service import obtener_tipo_cambio
    resultados = {}
    for moneda in ["USD", "EUR", "GBP"]:
        valor = await obtener_tipo_cambio(moneda)
        resultados[moneda] = {"valor_en_clp": valor, "moneda": moneda}
    return {"tipos_de_cambio": resultados, "moneda_base": "CLP"}


# ─── CONTACTO ───────────────────────────────────────────────────────────────
router_contacto = APIRouter(prefix="/contacto", tags=["Contacto"])

@router_contacto.post("/", response_model=ContactoResponse, status_code=201)
def enviar_mensaje(data: ContactoCreate, db: Session = Depends(get_db)):
    """Formulario de contacto público para que clientes consulten a vendedores."""
    mensaje = MensajeContacto(**data.model_dump())
    db.add(mensaje)
    db.commit()
    db.refresh(mensaje)
    return mensaje


@router_contacto.get("/mensajes", response_model=List[ContactoResponse])
def listar_mensajes(
    db: Session = Depends(get_db),
    _=Depends(require_roles(RolUsuario.vendedor, RolUsuario.administrador)),
):
    return db.query(MensajeContacto).order_by(MensajeContacto.fecha.desc()).all()


@router_contacto.put("/mensajes/{mensaje_id}/atender")
def marcar_atendido(
    mensaje_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles(RolUsuario.vendedor, RolUsuario.administrador)),
):
    mensaje = db.query(MensajeContacto).filter(MensajeContacto.id == mensaje_id).first()
    if not mensaje:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    mensaje.atendido = True
    db.commit()
    return {"mensaje": "Consulta marcada como atendida"}
