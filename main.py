from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

# CORS（Reactとの連携用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番ではセキュリティ上制限すべき
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
