from fastapi import FastAPI
from app.core.config import settings
from app.api.v1 import health, analyze

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(analyze.router, prefix="/api/v1", tags=["analyze"])


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME}"}
