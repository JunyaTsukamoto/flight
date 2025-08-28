from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

# CORS（Reactとの連携用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 開発用
    allow_origin_regex=r"https://.*\.vercel\.app",  # Vercel配下を許可
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/airports")
def get_airports():
    with open("airports.json", encoding="utf-8") as f:
        return json.load(f)

@app.get("/flights")
def get_flights():
    with open("flights.json", encoding="utf-8") as f:
        return json.load(f)

@app.get("/healthz")
def healthz():
    return {"ok": True}
