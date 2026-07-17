import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship

# --- 1. DATABASE SETUP & MODELS ---

DATABASE_URL = "sqlite:///./kudbee_telemetry.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    tier = Column(String, default="Free")  # Free, Lifetime
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    token_logs = relationship("TokenLog", back_populates="user")
    quotas = relationship("QuotaTracker", back_populates="user")

class TokenLog(Base):
    __tablename__ = "token_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    provider = Column(String, index=True)
    model_name = Column(String, index=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    calculated_cost = Column(Float, default=0.0)
    project_name = Column(String, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="token_logs")

class QuotaTracker(Base):
    __tablename__ = "quota_trackers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    provider = Column(String, index=True)
    total_allowance = Column(Integer, default=0)
    used_allowance = Column(Integer, default=0)
    reset_timestamp = Column(DateTime)

    user = relationship("User", back_populates="quotas")

Base.metadata.create_all(bind=engine)

# --- 2. LOGIC & BUSINESS RULES ---

# Cost per 1,000 tokens (USD)
MODEL_COSTS = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
    "deepseek-r1": {"input": 0.00055, "output": 0.00219},
    "deepseek-v3": {"input": 0.00014, "output": 0.00028},
}

def calculate_cost(model_name: str, input_tokens: int, output_tokens: int) -> float:
    rates = MODEL_COSTS.get(model_name)
    if not rates:
        return 0.0
    return (input_tokens / 1000.0) * rates["input"] + (output_tokens / 1000.0) * rates["output"]

# --- 3. PYDANTIC SCHEMAS ---

class TokenLogCreate(BaseModel):
    user_id: int
    provider: str
    model_name: str
    input_tokens: int
    output_tokens: int
    project_name: Optional[str] = None

class TokenLogResponse(BaseModel):
    id: int
    user_id: int
    provider: str
    model_name: str
    input_tokens: int
    output_tokens: int
    calculated_cost: float
    project_name: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# --- 4. FASTAPI ENDPOINTS ---

app = FastAPI(title="Kudbee Fuel Gauge API", description="Telemetry ingestion for AI token tracking")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def seed_initial_data():
    db = SessionLocal()
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        user = User(id=1, email="dev@kudbee.local", tier="Pro")
        db.add(user)
        # Seed initial quotas
        db.add(QuotaTracker(user_id=1, provider="Anthropic", total_allowance=500000, used_allowance=200000, reset_timestamp=datetime.now(timezone.utc) + timedelta(hours=5)))
        db.add(QuotaTracker(user_id=1, provider="Cursor", total_allowance=500, used_allowance=175, reset_timestamp=datetime.now(timezone.utc) + timedelta(hours=3)))
        db.commit()
    db.close()

@app.post("/api/telemetry/log", response_model=TokenLogResponse)
def ingest_token_log(log_in: TokenLogCreate, db: Session = Depends(get_db)):
    cost = calculate_cost(log_in.model_name, log_in.input_tokens, log_in.output_tokens)
    
    new_log = TokenLog(
        user_id=log_in.user_id,
        provider=log_in.provider,
        model_name=log_in.model_name,
        input_tokens=log_in.input_tokens,
        output_tokens=log_in.output_tokens,
        calculated_cost=cost,
        project_name=log_in.project_name
    )
    db.add(new_log)
    
    # Auto-increment quota tracker
    quota = db.query(QuotaTracker).filter(
        QuotaTracker.user_id == log_in.user_id,
        QuotaTracker.provider == log_in.provider
    ).first()
    
    if quota:
        # Cursor tracks raw request limits, others track raw tokens
        if quota.provider == "Cursor":
            quota.used_allowance += 1
        else:
            quota.used_allowance += (log_in.input_tokens + log_in.output_tokens)
            
    db.commit()
    db.refresh(new_log)
    return new_log

@app.get("/api/dashboard/summary")
def get_dashboard_summary(user_id: int = 1, db: Session = Depends(get_db)):
    last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    logs_24h = db.query(TokenLog).filter(TokenLog.user_id == user_id, TokenLog.timestamp >= last_24h).all()
    
    total_cost_24h = sum(log.calculated_cost for log in logs_24h)
    
    all_logs = db.query(TokenLog).filter(TokenLog.user_id == user_id).all()
    total_input_tokens = sum(log.input_tokens for log in all_logs)
    total_output_tokens = sum(log.output_tokens for log in all_logs)
    
    active_models = list(set(log.model_name for log in logs_24h))
    
    quotas = db.query(QuotaTracker).filter(QuotaTracker.user_id == user_id).all()
    health_matrix = []
    for q in quotas:
        remaining = max(0, q.total_allowance - q.used_allowance)
        percentage = int((remaining / q.total_allowance) * 100) if q.total_allowance > 0 else 0
        now = datetime.now(timezone.utc)
        
        # Keep datetimes in UTC for subtraction
        reset_time = q.reset_timestamp.replace(tzinfo=timezone.utc) if q.reset_timestamp else now
        time_left = reset_time - now
        seconds_left = max(0, int(time_left.total_seconds()))
        
        health_matrix.append({
            "provider": q.provider,
            "total_allowance": q.total_allowance,
            "used_allowance": q.used_allowance,
            "remaining": remaining,
            "percentage_remaining": percentage,
            "seconds_until_reset": seconds_left
        })

    return {
        "total_24h_cost": round(total_cost_24h, 4),
        "total_historical_tokens": total_input_tokens + total_output_tokens,
        "total_active_models": len(active_models),
        "health_matrix": health_matrix
    }

# =====================================================================
# 5. LOCAL DAEMON TEST SCRIPT
# =====================================================================
# To run the test script: `pip install fastapi uvicorn sqlalchemy pydantic requests`
# Then execute this file directly: `python main.py`

if __name__ == "__main__":
    import uvicorn
    import threading
    import time
    import requests
    import random

    def run_daemon():
        time.sleep(2)  # Wait a moment for the server to start
        print("\n[Daemon] Starting local telemetry daemon...")
        url = "http://127.0.0.1:8000/api/telemetry/log"
        models = [
            ("Anthropic", "claude-3-5-sonnet"),
            ("DeepSeek", "deepseek-r1"),
            ("Google", "gemini-1.5-pro"),
            ("Cursor", "gpt-4o")
        ]
        
        while True:
            provider, model_name = random.choice(models)
            payload = {
                "user_id": 1,
                "provider": provider,
                "model_name": model_name,
                "input_tokens": random.randint(50, 500),
                "output_tokens": random.randint(10, 150),
                "project_name": "kilo-fuel-gauge"
            }
            try:
                response = requests.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    print(f"[Daemon] Logged {model_name} | Cost: ${data['calculated_cost']:.6f} | Tokens: {data['input_tokens']} In / {data['output_tokens']} Out")
                else:
                    print(f"[Daemon] Error: {response.status_code} {response.text}")
            except requests.exceptions.ConnectionError:
                pass # Server not yet online
            time.sleep(2)

    # Start the daemon in a background thread
    daemon_thread = threading.Thread(target=run_daemon, daemon=True)
    daemon_thread.start()

    # Start the FastAPI server
    print("Starting FastAPI server on http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
