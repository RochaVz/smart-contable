# Imagen reproducible del backend para la beta en servicios cloud.
FROM python:3.13-slim

WORKDIR /app

# Dependencias del sistema requeridas por lxml, pymupdf y pdfplumber.
COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Carpeta temporal para cargas/procesamiento durante el request.
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Ejecuta migraciones controladas antes de iniciar el servidor y expande $PORT.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
