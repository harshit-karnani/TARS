from pathlib import Path
import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parent
model = joblib.load(ROOT / "models" / "risk_classifier.joblib")

examples = pd.DataFrame([
    {
        "tool_name": "read_file",
        "tool_category": "filesystem",
        "is_mutation": 0,
        "schema_valid": 1,
        "path_traversal": 0,
        "prompt_injection": 0,
        "suspicious_command": 0,
        "unknown_tool": 0,
        "contract_drift": 0,
        "payload_size": 100,
    },
    {
        "tool_name": "write_file",
        "tool_category": "filesystem",
        "is_mutation": 1,
        "schema_valid": 1,
        "path_traversal": 0,
        "prompt_injection": 0,
        "suspicious_command": 0,
        "unknown_tool": 0,
        "contract_drift": 0,
        "payload_size": 500,
    },
    {
        "tool_name": "execute_system_command",
        "tool_category": "system",
        "is_mutation": 1,
        "schema_valid": 1,
        "path_traversal": 0,
        "prompt_injection": 0,
        "suspicious_command": 1,
        "unknown_tool": 0,
        "contract_drift": 0,
        "payload_size": 100,
    },
])

predictions = model.predict(examples)
probabilities = model.predict_proba(examples)

for row, risk, probs in zip(
    examples.to_dict(orient="records"), predictions, probabilities
):
    print(
        f"{row['tool_name']}: predicted_risk={risk}, "
        f"confidence={max(probs):.2f}"
    )

print("\nShadow mode only: predictions do not authorize or block execution.")
