import os
import re
import json
import sqlite3
from typing import List, Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from network import router as network_router


load_dotenv()

XAI_API_KEY = os.getenv("XAI_API_KEY")
if not XAI_API_KEY:
    raise RuntimeError(
        "XAI_API_KEY is not set. Create a .env file with XAI_API_KEY=your_key_here"
    )

DB_PATH = os.getenv("DB_PATH", "intelligence_core.db")

app = FastAPI(title="KSP God's Eye - Grok Core")

# Allow both localhost and 127.0.0.1 -- browsers treat these as different origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(network_router)
# NOTE: the base_url below must be a plain string. A previous version had
# Markdown link syntax ("[url](url)") pasted in by mistake, which is invalid
# Python and was the main reason the backend never actually reached xAI.
client = OpenAI(
    api_key=XAI_API_KEY,
    base_url="https://api.x.ai/v1",
)

# xAI's current canonical chat model alias (as of mid-2026). Older aliases
# like "grok-beta" / "grok-3" / "grok-4" are retired and silently redirect
# here anyway, but pointing at it directly avoids surprises.
GROK_MODEL = os.getenv("GROK_MODEL", "grok-4.3")

# --- Very simple in-memory session store for context-aware follow-ups ---
# In production replace this with Redis / a DB table keyed by session_id.
SESSIONS: Dict[str, List[dict]] = {}
MAX_HISTORY_TURNS = 12  # keep last N messages per session to bound token usage

# --- SQL safety guardrails -------------------------------------------------
# The model only ever gets to run read-only SELECT statements. Anything else
# (INSERT/UPDATE/DELETE/DROP/ATTACH/PRAGMA etc.) is rejected before it ever
# touches the database.
FORBIDDEN_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|attach|detach|pragma|create|replace|vacuum)\b",
    re.IGNORECASE,
)


def is_safe_select(query: str) -> bool:
    q = query.strip().strip(";")
    if not q.lower().startswith("select"):
        return False
    if ";" in q:  # no stacked statements
        return False
    if FORBIDDEN_PATTERN.search(q):
        return False
    return True


def execute_sql_query(query: str) -> str:
    if not is_safe_select(query):
        return "Query rejected: only single read-only SELECT statements are permitted."
    try:
        # mode=ro opens a genuinely read-only connection at the SQLite level,
        # so even a bug in is_safe_select can't result in a write.
        uri = f"file:{DB_PATH}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchmany(200)  # cap result size
        conn.close()
        return json.dumps([dict(r) for r in rows])
    except Exception as e:
        return f"Database Error: {str(e)}"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatPayload(BaseModel):
    session_id: str
    messages: List[ChatMessage]


SYSTEM_PROMPT = (
    "You are the KSP God's Eye Intelligence AI. You have access to a SQLite "
    "database representing the official KSP FIR system.\n"
    "Key tables include:\n"
    "1. case_master (CaseMasterID, CrimeNo, BriefFacts, IncidentFromDate)\n"
    "2. accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear)\n"
    "3. victim (VictimMasterID, CaseMasterID, VictimName)\n"
    "4. employee (EmployeeID, FirstName) - Investigating Officers\n"
    "5. telecom_logs (target_name, phone_number, frequent_towers, associated_contacts)\n"
    "6. cctv_metadata (timestamp, location, vehicle_desc, license_plate, flags)\n\n"
    "Use the ongoing conversation for context on follow-up questions "
    "(e.g. 'what about him' should resolve to whoever was last discussed).\n"
    "Write a single valid read-only SQL SELECT statement (JOINs allowed, no "
    "semicolons, no writes) to answer the latest user message. "
    "Output strictly valid JSON, no markdown fences, exactly like this:\n"
    "{\n"
    '  "tool_used": "sqlite",\n'
    '  "query_executed": "YOUR_SQL_QUERY_HERE",\n'
    '  "final_answer": ""\n'
    "}"
)


def strip_code_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:]
    return content.strip()


@app.post("/api/chat")
async def chat_endpoint(payload: ChatPayload):
    try:
        session_id = payload.session_id
        history = SESSIONS.setdefault(session_id, [])

        # Append the new incoming user message(s) to session history
        for m in payload.messages:
            history.append({"role": m.role, "content": m.content})
        history[:] = history[-MAX_HISTORY_TURNS:]

        user_prompt = history[-1]["content"]

        # Step 1: Ask Grok to generate the SQL, with full conversation context
        decision = client.chat.completions.create(
            model=GROK_MODEL,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *history],
            temperature=0.1,
        )

        content = strip_code_fences(decision.choices[0].message.content)

        try:
            raw_result = json.loads(content)
        except json.JSONDecodeError:
            raw_result = {"tool_used": "none", "query_executed": "", "final_answer": ""}

        sql_query = raw_result.get("query_executed", "")

        # Step 2: Execute the SQL (read-only, guarded)
        db_results = execute_sql_query(sql_query) if sql_query else "No query generated."

        # Step 3: Ask Grok to turn raw rows into a readable report
        synthesis_system_prompt = (
            "You are a sharp, analytical AI assistant for law enforcement. "
            "Write a concise, professional intelligence report answering the "
            "user's latest question, grounded only in the data provided. "
            "If the data is empty or an error, say so plainly rather than "
            "inventing details. Speak directly to the investigator."
        )
        synthesis_user_prompt = (
            f"The user asked: '{user_prompt}'.\n"
            f"The database returned this raw data: {db_results}."
        )

        final_response = client.chat.completions.create(
            model=GROK_MODEL,
            messages=[
                {"role": "system", "content": synthesis_system_prompt},
                {"role": "user", "content": synthesis_user_prompt},
            ],
            temperature=0.5,
        )

        final_answer = final_response.choices[0].message.content
        raw_result["final_answer"] = final_answer
        raw_result["debug_raw_data"] = db_results

        # Record the assistant's answer in session history too
        history.append({"role": "assistant", "content": final_answer})
        history[:] = history[-MAX_HISTORY_TURNS:]

        return raw_result

    except Exception as e:
        print(f"Backend Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)