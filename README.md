# TARS — Contract-Aware MCP Runtime Security Gateway

TARS is a runtime security gateway for the Model Context Protocol (MCP). It intercepts MCP tool calls, enforces contract-aware deterministic security policies, and provides comprehensive audit logging.

## Core Features
- **Contract-Aware Enforcement**: Deterministic `ALLOW`, `BLOCK`, and `REQUIRE_APPROVAL` decisions evaluated against verified tool contracts and schemas.
- **MCP Stdio & Gateway Server**: Operates as an MCP server with seamless upstream forwarding to real tools (e.g., filesystem servers).
- **Security Protections**: Real-time path traversal detection, prompt injection heuristics, and secret redaction.
- **Audit Logging**: SQLite-backed audit trails and SSE event streaming.
- **Adaptive Risk Scoring (Shadow Mode)**: Auxiliary ML-based risk predictions (`LOW`, `MEDIUM`, `HIGH`) operating in observational shadow mode without altering deterministic decisions.

## ML-Based Shadow Scoring
For detailed instructions on running, training, and testing the ML adaptive risk scoring service, refer to [ml-policy/README.md](file:///D:/tars/Tars/ml-policy/README.md).
