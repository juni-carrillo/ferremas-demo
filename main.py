import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.database.database import engine
from backend.models.models import Base
from backend.routers import auth, productos, pedidos, pagos, admin
from backend.routers.extras import router_divisas, router_contacto

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from backend.seed import seed as seed_database
    try:
        seed_database()
        logger.info("Seed ejecutado correctamente")
    except Exception as e:
        logger.error("Error al ejecutar seed: %s", e)
    yield

app = FastAPI(
    title="FERREMAS API",
    description="""
## API de la plataforma de comercio electrónico FERREMAS

Sistema desarrollado para la distribuidora de productos de ferretería y construcción **FERREMAS**.

### Módulos disponibles:
- **Autenticación** – registro, login y gestión de sesión con JWT
- **Productos** – catálogo, búsqueda y gestión de inventario
- **Pedidos** – flujo completo por roles (cliente → vendedor → bodeguero → contador)
- **Pagos** – integración con Webpay Plus y confirmación de transferencias
- **Divisas** – conversión en tiempo real vía Banco Central de Chile
- **Contacto** – formulario de consultas cliente ↔ vendedor
- **Administración** – gestión de usuarios y reportes
    """,
    version="1.0.0",
    contact={"name": "Equipo de Desarrollo", "email": "dev@ferremas.cl"},
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,            prefix="/api")
app.include_router(productos.router,       prefix="/api")
app.include_router(pedidos.router,         prefix="/api")
app.include_router(pagos.router,           prefix="/api")
app.include_router(admin.router,           prefix="/api")
app.include_router(router_divisas,         prefix="/api")
app.include_router(router_contacto,        prefix="/api")

frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "static")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/", include_in_schema=False)
def root():
    index_path = os.path.join(os.path.dirname(__file__), "frontend", "templates", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"mensaje": "FERREMAS API activa. Documentación en /docs"}

@app.get("/health", tags=["Sistema"])
def health():
    return {"estado": "ok", "servicio": "FERREMAS API", "version": "1.0.0"}
