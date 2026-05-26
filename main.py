from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from backend.database.database import engine
from backend.models.models import Base
from backend.routers import auth, productos, pedidos, pagos, admin
from backend.routers.extras import router_divisas, router_contacto

# Crear todas las tablas en la BD
Base.metadata.create_all(bind=engine)

# Sembrar datos de prueba al iniciar (útil en hosting gratuito)
from backend.seed import seed as seed_database
seed_database()

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
)

# CORS – permite que el frontend (mismo servidor o localhost) llame a la API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # En producción: especificar dominios
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(auth.router,            prefix="/api")
app.include_router(productos.router,       prefix="/api")
app.include_router(pedidos.router,         prefix="/api")
app.include_router(pagos.router,           prefix="/api")
app.include_router(admin.router,           prefix="/api")
app.include_router(router_divisas,         prefix="/api")
app.include_router(router_contacto,        prefix="/api")

# Servir frontend estático
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
