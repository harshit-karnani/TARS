from pathlib import Path
import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "risk_classifier.joblib"

if not MODEL_PATH.exists():
    raise RuntimeError(f"Trained model not found at {MODEL_PATH}")

try:
    model = joblib.load(MODEL_PATH)
except Exception as e:
    raise RuntimeError(f"Failed to load risk classifier model from {MODEL_PATH}: {e}") from e

app = FastAPI(
    title="TARS ML Shadow Scorer",
    description="Adaptive risk classification in shadow mode for TARS security gateway.",
    version="0.1.0",
)

FEATURE_COLUMNS = [
    "tool_name",
    "tool_category",
    "is_mutation",
    "schema_valid",
    "path_traversal",
    "prompt_injection",
    "suspicious_command",
    "unknown_tool",
    "contract_drift",
    "payload_size",
]

class Features(BaseModel):
    tool_name: str = Field(min_length=1, max_length=128)
    tool_category: str = Field(default="unknown", min_length=1, max_length=64)
    is_mutation: int = Field(ge=0, le=1)
    schema_valid: int = Field(ge=0, le=1)
    path_traversal: int = Field(ge=0, le=1)
    prompt_injection: int = Field(ge=0, le=1)
    suspicious_command: int = Field(ge=0, le=1)
    unknown_tool: int = Field(ge=0, le=1)
    contract_drift: int = Field(ge=0, le=1)
    payload_size: int = Field(ge=0, le=10000000)

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "mode": "shadow",
        "model": "risk_classifier",
        "version": "0.1.0",
    }

@app.post("/predict")
def predict(features: Features):
    try:
        data = features.model_dump()
        row = pd.DataFrame([data])[FEATURE_COLUMNS]
        risk = str(model.predict(row)[0])
        probabilities = model.predict_proba(row)[0]
        classes = model.named_steps["classifier"].classes_
        class_probs = {
            str(label): round(float(prob), 4)
            for label, prob in zip(classes, probabilities)
        }
        return {
            "risk": risk,
            "confidence": round(float(max(probabilities)), 4),
            "class_probabilities": class_probs,
            "mode": "shadow",
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Prediction failed")

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("ML_HOST", "127.0.0.1")
    port = int(os.environ.get("ML_PORT", 8000))
    uvicorn.run(app, host=host, port=port, log_level="info")
