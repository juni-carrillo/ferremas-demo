FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; rm -f ferremas.db
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
