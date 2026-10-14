import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "training_data.csv"
MODEL = ROOT / "models" / "risk_classifier.joblib"
REPORT = ROOT / "reports" / "evaluation.json"

CATEGORICAL = ["tool_name", "tool_category"]
NUMERIC = [
    "is_mutation",
    "schema_valid",
    "path_traversal",
    "prompt_injection",
    "suspicious_command",
    "unknown_tool",
    "contract_drift",
    "payload_size",
]
TARGET = "risk"
FEATURES = CATEGORICAL + NUMERIC
LABELS = ["LOW", "MEDIUM", "HIGH"]


def main():
    df = pd.read_csv(DATA)
    df[TARGET] = df[TARGET].astype(str).str.strip().str.upper()

    required = FEATURES + [TARGET]
    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = df.dropna(subset=required)
    invalid_labels = sorted(set(df[TARGET]) - set(LABELS))
    if invalid_labels:
        raise ValueError(f"Unexpected risk labels: {invalid_labels}")

    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="raise")

    counts = df[TARGET].value_counts()
    if len(counts) != 3 or counts.min() < 2:
        raise ValueError(f"Need at least two examples per class: {counts.to_dict()}")

    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.30,
        random_state=42,
        stratify=y,
    )

    preprocessing = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("numeric", "passthrough", NUMERIC),
        ]
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessing", preprocessing),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=200,
                    class_weight="balanced",
                    random_state=42,
                    min_samples_leaf=1,
                ),
            ),
        ]
    )

    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    report = {
        "dataset_rows": int(len(df)),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "label_counts": {k: int(v) for k, v in counts.items()},
        "accuracy": float(accuracy_score(y_test, predictions)),
        "classification_report": classification_report(
            y_test,
            predictions,
            labels=LABELS,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix_labels": LABELS,
        "confusion_matrix": confusion_matrix(
            y_test, predictions, labels=LABELS
        ).tolist(),
        "warning": (
            "Synthetic starter data only. Metrics do not establish real-world "
            "security effectiveness. Keep predictions in shadow mode."
        ),
    }

    MODEL.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Rows: {len(df)} | Train: {len(X_train)} | Test: {len(X_test)}")
    print(f"Accuracy on synthetic holdout: {report['accuracy']:.3f}")
    print("\nClassification report:")
    print(classification_report(y_test, predictions, labels=LABELS, zero_division=0))
    print(f"Model saved: {MODEL}")
    print(f"Evaluation saved: {REPORT}")
    print("\nWARNING: synthetic-data metrics are not proof of security effectiveness.")


if __name__ == "__main__":
    main()
