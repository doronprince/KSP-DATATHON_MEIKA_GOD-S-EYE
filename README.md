# 👁️ KSP God's Eye – Intelligence Fusion Centre

**KSP God's Eye** is an Intelligent Conversational AI developed for **Track 1 of the Karnataka State Police (KSP) Datathon 2026**. 

Designed as a tactical intelligence command center, God's Eye empowers investigating officers to securely interact with complex law enforcement databases using natural language. By utilizing an Agentic Retrieval-Augmented Generation (RAG) architecture, the system autonomously translates plain-English queries into precise SQL statements, executes them against multi-node databases, and synthesizes the raw data into actionable, professional intelligence reports.

## ✨ Key Features
* **Agentic Text-to-SQL Reasoning:** Powered by xAI's Grok API, the system seamlessly bridges the gap between natural language and complex database queries (using `JOIN`s across multiple intelligence tables).
* **Multi-Modal Data Fusion:** Integrates official FIR structures (Case Master, Accused, Victim) with advanced surveillance nodes like Telecom Network Logs and CCTV Metadata.
* **Tactical Command UI:** A responsive, dark-mode Next.js frontend built for high-stakes environments, complete with an investigative audit trail showing exact SQL executions.
* **Voice-Enabled Synthesis:** Includes automated Text-to-Speech (TTS) reporting to brief investigators on query results hands-free.

## 🛠️ Technology Stack
* **Frontend:** Next.js, React, TypeScript, Tailwind CSS
* **Backend:** FastAPI, Python, Pydantic 
* **Database:** SQLite (Populated via Pandas from 28 structured KSP CSV datasets)
* **AI Engine:** xAI Grok API (via OpenAI SDK format)
