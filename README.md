# KSP God's Eye 👁️
**Intelligent Conversational AI & Crime Analytics Platform**

## 📖 Overview
KSP God's Eye is an advanced, AI-driven intelligence platform built for the Karnataka State Police. It bridges the gap between raw law enforcement data (FIRs, telecom logs, financial transactions) and actionable intelligence. By utilizing a secure Natural Language-to-SQL AI engine, investigators can query the state crime database conversationally in English and regional languages like Kannada.

The platform transcends basic data retrieval by offering dynamic criminal network topology mapping, predictive hotspot forecasting, automated risk profiling, and live operational alerts.

## 🏗️ System Architecture
The platform is built on a high-performance, decoupled **Split-Stack Architecture**:

*   **Frontend (The HUD):** Built with Next.js and React. It uses Tailwind CSS for a secure terminal aesthetic. Interactive data visualizations are powered by `recharts` (Analytics) and `d3.js` (Network Graphs).
*   **Backend (The Core):** A lightning-fast Python FastAPI application running on a Uvicorn ASGI server.
*   **Database:** SQLite3 running in strict Read-Only (`?mode=ro`) URI mode during intelligence queries to physically prevent SQL injection.
*   **AI Engine:** OpenAI Python SDK (configured for Gemini 2.5 Flash / Grok).
*   **Real-Time Streaming:** Persistent WebSocket tunnels (`/ws/alerts`) for broadcasting live geospatial and operational alerts.

## ✨ Key Modules & Features
1.  **Conversational Crime Intelligence Interface:** Chat interface with contextual memory. Supports native Kannada voice input and one-click PDF briefing exports.
2.  **Criminal Network Analysis:** Multi-hop D3.js graph traversal linking accused individuals, victims, cases, and classified telecom logs to detect syndicate clusters.
3.  **Crime Pattern Analytics:** Interactive Recharts dashboards visualizing crime typologies and their temporal trajectories across the year.
4.  **Sociological Crime Insights:** Correlates FIR details to generate socio-economic and demographic impact visualizations.
5.  **Criminology-Based Offender Profiling:** Automated risk-scoring algorithms (0-100) dynamically evaluate an accused individual's history to assign threat tiers (MODERATE, HIGH, CRITICAL).
6.  **Investigator Decision Support:** Secondary LLM synthesis layer analyzes raw SQL outputs to generate structured case summaries and actionable leads.
7.  **Financial Crime Link Analysis:** RBAC-gated access to financial transaction trails for detecting money laundering and organized crime funding.
8.  **Crime Forecasting & Early Warning:** Geospatial incident density calculations predict hotspots, while WebSocket tunnels push real-time threat alerts to the UI.
9.  **Explainable AI (XAI):** "XAI Data Trace" panels expose the exact SQL payload used by the LLM, guaranteeing zero hallucination and total auditability.
10. **Secure RBAC & Governance:** Stateless JWT authentication verifies official K.G.I.D.s. Every query is permanently recorded in an immutable `audit_logs` table.

## 🔐 Security & Compliance
*   **Strict RBAC:** Role-Based Access Control determines tab visibility and database clearance (Investigator, Analyst, Supervisor).
*   **Immutable Audit Trails:** Every systemic action and SQL execution is logged with a timestamp and the operator's K.G.I.D.
*   **Read-Only AI Execution:** The AI accesses the database through an isolated, read-only cursor, ensuring core data cannot be altered or dropped.
