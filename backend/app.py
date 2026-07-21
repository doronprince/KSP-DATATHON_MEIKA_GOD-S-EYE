import os
import re
import json
import sqlite3
from typing import List, Dict
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import jwt

from auth import (
    DB_PATH, get_current_user, verify_password, hash_password,
    create_access_token, decode_token, log_audit
)
from network import router as network_router

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROK_MODEL = os.getenv("GROK_MODEL", "gemini-2.5-flash")

app = FastAPI(title="KSP God's Eye - Secure Core")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(network_router)

client = OpenAI(
    api_key=GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

SESSIONS: Dict[str, List[dict]] = {}
MAX_HISTORY_TURNS = 12

FORBIDDEN_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|attach|detach|pragma|create|replace|vacuum)\b",
    re.IGNORECASE,
)

ACTIVE_CONNECTIONS: List[WebSocket] = []


# --- INIT DATABASE SCHEMAS (Self-Healing) ---
def init_dynamic_tables():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS financial_transactions
                   (
                       txn_id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       sender_name
                       TEXT,
                       receiver_name
                       TEXT,
                       amount
                       REAL,
                       txn_date
                       TEXT,
                       case_id
                       INTEGER,
                       flag
                       TEXT
                   )''')
    conn.commit()
    conn.close()


init_dynamic_tables()


def generate_system_prompt(user_role: str) -> str:
    base_tables = (
        "- case_master (CaseMasterID, CrimeNo, CaseNo, CrimeRegisteredDate, PolicePersonID, PoliceStationID, CaseCategoryID, GravityOffenceID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, CourtID, IncidentFromDate, IncidentToDate, InfoReceivedPSDate, latitude, longitude, BriefFacts)\n"
        "- complainant_details (ComplainantID, CaseMasterID, ComplainantName, AgeYear, OccupationID, ReligionID, CasteID, GenderID)\n"
        "- victim (VictimMasterID, CaseMasterID, VictimName, AgeYear, GenderID, VictimPolice)\n"
        "- accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear, GenderID, PersonID)\n"
        "- arrest_surrender (ArrestSurrenderID, CaseMasterID, ArrestSurrenderTypeID, ArrestSurrenderDate, ArrestSurrenderStateId, ArrestSurrenderDistrictId, PoliceStationID, IOID, CourtID, AccusedMasterID, IsAccused, IsComplainantAccused)\n"
        "- act (ActCode, ActDescription, ShortName, Active)\n"
        "- section (ActCode, SectionCode, SectionDescription, Active)\n"
        "- crime_head_act_section (CrimeHeadID, ActCode, SectionCode)\n"
        "- crime_head (CrimeHeadID, CrimeGroupName, Active)\n"
        "- crime_sub_head (CrimeSubHeadID, CrimeHeadID, CrimeHeadName, SeqID)\n"
        "- caste_master (caste_master_id, caste_master_name)\n"
        "- religion_master (ReligionID, ReligionName)\n"
        "- occupation_master (OccupationID, OccupationName)\n"
        "- case_status_master (CaseStatusID, CaseStatusName)\n"
        "- court (CourtID, CourtName, DistrictID, StateID, Active)\n"
        "- district (DistrictID, DistrictName, StateID, Active)\n"
        "- state (StateID, StateName, NationalityID, Active)\n"
        "- unit (UnitID, UnitName, TypeID, ParentUnit, NationalityID, StateID, DistrictID, Active)\n"
        "- unit_type (UnitTypeID, UnitTypeName, CityDistState, Hierarchy, Active)\n"
        "- rank (RankID, RankName, Hierarchy, Active)\n"
        "- designation (DesignationID, DesignationName, Active, SortOrder)\n"
        "- employee (EmployeeID, DistrictID, UnitID, RankID, DesignationID, KGID, FirstName, EmployeeDOB, GenderID, BloodGroupID, PhysicallyChallenged, AppointmentDate)\n"
        "- case_category (CaseCategoryID, LookupValue)\n"
        "- gravity_offence (GravityOffenceID, LookupValue)\n"
        "- chargesheet_details (CSID, CaseMasterID, csdate, cstype, PolicePersonID)\n"
    )

    classified_tables = (
        "- telecom_logs (phone_number, target_name, frequent_towers, associated_contacts)\n"
        "- financial_transactions (txn_id, sender_name, receiver_name, amount, txn_date, case_id, flag)\n"
        "- users (kgid, name, password_hash, role, designation)\n"
        "- audit_logs (id, kgid, action, query_executed, timestamp)\n"
    )

    prompt = (
        "You are the KSP God's Eye Intelligence AI. You have access to a SQLite database representing the official KSP FIR system. "
        "IMPORTANT - You must ONLY use the following tables and columns to build your queries. Do not hallucinate columns:\n"
        f"{base_tables}"
    )

    if user_role.lower() in ["supervisor", "analyst", "investigator"]:
        prompt += f"{classified_tables}\n"
    else:
        prompt += (
            "\nSECURITY CLEARANCE NOTICE: The user does NOT have clearance for telecom, financial, "
            "audit, or intelligence logs. If they ask for this classified data, do NOT write SQL. "
            "Instead, reply exactly with this JSON: "
            '{"tool_used": "none", "query_executed": "", "final_answer": "ACCESS DENIED: Insufficient clearance level."}\n'
        )

    prompt += (
        "Write a single valid read-only SQL SELECT statement (JOINs allowed, no semicolons, no writes) to answer the latest user message. "
        "Translate questions asked in Kannada to English internally to form the query, and provide the final answer in the language requested. "
        "Output strictly valid JSON exactly like this:\n"
        '{"tool_used": "sqlite", "query_executed": "YOUR_SQL_QUERY_HERE", "final_answer": ""}'
    )
    return prompt


def is_safe_select(query: str) -> bool:
    q = query.strip().strip(";")
    if not q.lower().startswith("select") or ";" in q or FORBIDDEN_PATTERN.search(q):
        return False
    return True


def execute_sql_query(query: str, kgid: str) -> str:
    if not is_safe_select(query):
        log_audit(kgid, "BLOCKED_SQL_INJECTION", query)
        return "Query rejected: Policy Violation."
    log_audit(kgid, "EXECUTE_SQL", query)
    try:
        uri = f"file:{DB_PATH}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchmany(200)
        conn.close()
        return json.dumps([dict(r) for r in rows])
    except Exception as e:
        return f"Database Error: {str(e)}"


# --- AUTH ENDPOINTS ---
class RegisterPayload(BaseModel):
    kgid: str
    password: str


@app.post("/api/register")
async def register_user(payload: RegisterPayload):
    kgid_upper = payload.kgid.strip().upper()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS users
                   (
                       kgid
                       TEXT
                       PRIMARY
                       KEY,
                       name
                       TEXT,
                       password_hash
                       TEXT,
                       role
                       TEXT,
                       designation
                       TEXT
                   )''')
    conn.commit()

    if cur.execute("SELECT * FROM users WHERE kgid = ?", (kgid_upper,)).fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Account already exists.")

    official_record = cur.execute("""
                                  SELECT e.FirstName, d.DesignationName
                                  FROM employee e
                                           LEFT JOIN designation d ON e.DesignationID = d.DesignationID
                                  WHERE UPPER(e.KGID) = ?
                                  """, (kgid_upper,)).fetchone()

    if not official_record:
        conn.close()
        log_audit(kgid_upper, "FAILED_UNAUTHORIZED_REGISTRATION_ATTEMPT")
        raise HTTPException(status_code=403, detail="SECURITY CLEARANCE DENIED: K.G.I.D. not found.")

    first_name = official_record["FirstName"]
    designation = official_record["DesignationName"] or "Officer"
    system_role = "Supervisor" if "DSP" in designation.upper() or "COMMISSIONER" in designation.upper() else "Analyst" if "INSPECTOR" in designation.upper() else "Investigator"

    cur.execute(
        "INSERT INTO users (kgid, name, password_hash, role, designation) VALUES (?, ?, ?, ?, ?)",
        (kgid_upper, first_name, hash_password(payload.password), system_role, designation)
    )
    conn.commit()
    conn.close()
    log_audit(kgid_upper, "SUCCESSFUL_ACCOUNT_CREATION")
    return {"message": f"Account created successfully."}


@app.post("/api/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    kgid_upper = form_data.username.strip().upper()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    user = conn.execute("SELECT * FROM users WHERE kgid = ?", (kgid_upper,)).fetchone()
    conn.close()

    if not user or not verify_password(form_data.password, user["password_hash"]):
        log_audit(kgid_upper, "FAILED_LOGIN")
        raise HTTPException(status_code=400, detail="Incorrect K.G.I.D. or password")

    access_token = create_access_token(data={"sub": user["kgid"], "role": user["role"], "name": user["name"]})
    log_audit(user["kgid"], "SUCCESSFUL_LOGIN")
    return {"access_token": access_token, "token_type": "bearer", "role": user["role"], "name": user["name"]}


# --- CHAT ENDPOINTS ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatPayload(BaseModel):
    session_id: str
    messages: List[ChatMessage]


def strip_code_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:]
    return content.strip()


@app.post("/api/chat")
async def chat_endpoint(payload: ChatPayload, current_user: dict = Depends(get_current_user)):
    try:
        kgid = current_user.get("sub")
        user_role = current_user.get("role", "standard")
        history = SESSIONS.setdefault(payload.session_id, [])

        for m in payload.messages:
            history.append({"role": m.role, "content": m.content})
        history[:] = history[-MAX_HISTORY_TURNS:]

        decision = client.chat.completions.create(
            model=GROK_MODEL,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": generate_system_prompt(user_role)}, *history],
            temperature=0.1,
        )

        try:
            raw_result = json.loads(strip_code_fences(decision.choices[0].message.content))
        except json.JSONDecodeError:
            raw_result = {"tool_used": "none", "query_executed": "", "final_answer": ""}

        sql_query = raw_result.get("query_executed", "")

        if "ACCESS DENIED" in raw_result.get("final_answer", ""):
            db_results = "Security Exception: Action Aborted."
            final_answer = raw_result["final_answer"]
        else:
            db_results = execute_sql_query(sql_query, kgid) if sql_query else "No query generated."
            synthesis_response = client.chat.completions.create(
                model=GROK_MODEL,
                messages=[{"role": "system",
                           "content": "Write a professional intelligence report answering the user's question, grounded only in the data provided. Reply in the language the user asked in."},
                          {"role": "user", "content": f"User: '{history[-1]['content']}'.\nRaw Data: {db_results}."}],
                temperature=0.5,
            )
            final_answer = synthesis_response.choices[0].message.content

        raw_result["final_answer"] = final_answer
        raw_result["debug_raw_data"] = db_results
        history.append({"role": "assistant", "content": final_answer})
        return raw_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- MODULES 3 & 4: ANALYTICS & DEMOGRAPHICS ---
@app.get("/api/analytics")
async def get_intelligence_analytics(current_user: dict = Depends(get_current_user)):
    kgid = current_user.get("sub")
    log_audit(kgid, "ACCESSED_ANALYTICS_DASHBOARD")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('''
                   SELECT ch.CrimeGroupName as category, COUNT(cm.CaseMasterID) as count
                   FROM case_master cm
                       JOIN crime_head ch
                   ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                   GROUP BY ch.CrimeGroupName
                   ORDER BY count DESC LIMIT 10
                   ''')
    category_data = [dict(row) for row in cursor.fetchall()]

    cursor.execute('''
                   SELECT strftime('%Y-%m', CrimeRegisteredDate) as month, COUNT(CaseMasterID) as count
                   FROM case_master
                   WHERE CrimeRegisteredDate IS NOT NULL AND CrimeRegisteredDate != ''
                   GROUP BY month
                   ORDER BY month ASC LIMIT 12
                   ''')
    timeline_data = [dict(row) for row in cursor.fetchall()]

    cursor.execute('''
                   SELECT om.OccupationName as demographic, COUNT(cd.ComplainantID) as count
                   FROM complainant_details cd
                       JOIN occupation_master om
                   ON cd.OccupationID = om.OccupationID
                   WHERE om.OccupationName IS NOT NULL
                   GROUP BY om.OccupationName
                   ORDER BY count DESC LIMIT 5
                   ''')
    demographic_data = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {
        "category_data": category_data,
        "timeline_data": timeline_data,
        "demographic_data": demographic_data
    }


# --- MODULE 5: OFFENDER PROFILING & RISK SCORING ---
@app.get("/api/profiling/offender/{accused_name}")
async def get_offender_profile(accused_name: str, current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
                   SELECT cm.CaseNo, go.LookupValue as gravity
                   FROM accused a
                            JOIN case_master cm ON a.CaseMasterID = cm.CaseMasterID
                            LEFT JOIN gravity_offence go
                   ON cm.GravityOffenceID = go.GravityOffenceID
                   WHERE a.AccusedName LIKE ?
                   ''', (f"%{accused_name}%",))
    cases = cursor.fetchall()
    conn.close()

    if not cases:
        raise HTTPException(status_code=404, detail="Offender not found in records.")

    risk_score = 0
    heinous_count = 0
    for case in cases:
        risk_score += 10
        if case["gravity"] and "Heinous" in case["gravity"]:
            risk_score += 40
            heinous_count += 1

    return {
        "offender": accused_name,
        "total_cases": len(cases),
        "heinous_crimes": heinous_count,
        "computed_risk_score": min(risk_score, 100),
        "risk_tier": "CRITICAL" if risk_score > 80 else "HIGH" if risk_score > 40 else "MODERATE"
    }


# --- MODULE 2 & 8: CLUSTERING & FORECASTING ---
@app.get("/api/network/clusters")
async def detect_syndicates(current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
                   SELECT a1.AccusedName         AS associate_1,
                          a2.AccusedName         AS associate_2,
                          COUNT(a1.CaseMasterID) as shared_cases
                   FROM accused a1
                            JOIN accused a2
                                 ON a1.CaseMasterID = a2.CaseMasterID AND a1.AccusedMasterID < a2.AccusedMasterID
                   GROUP BY associate_1, associate_2
                   HAVING shared_cases > 1
                   ORDER BY shared_cases DESC LIMIT 10
                   ''')
    clusters = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return clusters


@app.get("/api/forecasting/hotspots")
async def forecast_hotspots(current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
                   SELECT latitude, longitude, COUNT(*) as incident_density
                   FROM case_master
                   WHERE latitude IS NOT NULL
                     AND longitude IS NOT NULL
                   GROUP BY ROUND(latitude, 3), ROUND(longitude, 3)
                   HAVING incident_density > 2
                   ORDER BY incident_density DESC LIMIT 5
                   ''')
    hotspots = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"predicted_hotspots": hotspots}


# --- GEOSPATIAL ENDPOINTS ---
@app.get("/api/geospatial/cases")
async def get_geospatial_cases(current_user: dict = Depends(get_current_user)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT CaseMasterID, CrimeNo, CaseNo, latitude, longitude, BriefFacts FROM case_master WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


@app.get("/api/geospatial/telecom-towers")
async def get_geospatial_towers(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role", "standard")
    if role.lower() not in ["supervisor", "analyst", "investigator"]:
        raise HTTPException(status_code=403, detail="ACCESS DENIED: Insufficient surveillance clearance.")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        if not cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='telecom_logs'").fetchone():
            cursor.execute('''CREATE TABLE telecom_logs
                              (
                                  phone_number        TEXT,
                                  target_name         TEXT,
                                  frequent_towers     TEXT,
                                  associated_contacts TEXT
                              )''')
            conn.commit()

        cursor.execute("SELECT COUNT(*) FROM telecom_logs")
        if cursor.fetchone()[0] == 0:
            sample_data = [
                ("+91-9876543210", "Suspect Alpha", '[{"lat": 12.9716, "lng": 77.5946, "hits": 45}]',
                 '["+91-8888888888"]'),
                ("+91-9999999999", "Alias 'Ghost'",
                 '[{"lat": 13.0827, "lng": 80.2707, "hits": 89}, {"lat": 13.0674, "lng": 80.2376, "hits": 12}]',
                 '["+91-1111111111"]')
            ]
            cursor.executemany(
                "INSERT INTO telecom_logs (phone_number, target_name, frequent_towers, associated_contacts) VALUES (?, ?, ?, ?)",
                sample_data)
            conn.commit()

        cursor.execute(
            "SELECT rowid AS id, phone_number, target_name, frequent_towers, associated_contacts FROM telecom_logs")
        results = []
        for r in cursor.fetchall():
            row_dict = dict(r)
            try:
                row_dict["frequent_towers"] = json.loads(row_dict["frequent_towers"]) if row_dict[
                    "frequent_towers"] else []
                row_dict["associated_contacts"] = json.loads(row_dict["associated_contacts"]) if row_dict[
                    "associated_contacts"] else []
            except Exception:
                pass
            results.append(row_dict)
        return results
    finally:
        conn.close()


# --- ADMIN ENDPOINTS ---
@app.get("/api/admin/audit-logs")
async def get_system_audit_logs(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role", "standard")
    if role.lower() not in ["supervisor", "analyst"]:
        raise HTTPException(status_code=403, detail="ACCESS DENIED")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT id, kgid, action, query_executed, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 500")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


# --- WEBSOCKET ALERTS ENGINE ---
@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket, token: str = Query(default="")):
    try:
        if not token: raise ValueError("missing token")
        decode_token(token)
    except (jwt.PyJWTError, ValueError):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    ACTIVE_CONNECTIONS.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ACTIVE_CONNECTIONS.remove(websocket)


class AlertPayload(BaseModel):
    title: str
    message: str
    severity: str


@app.post("/api/alerts/trigger")
async def trigger_live_alert(payload: AlertPayload, current_user: dict = Depends(get_current_user)):
    if current_user.get("role", "standard").lower() not in ["supervisor", "analyst"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")

    alert_json = {
        "id": datetime.utcnow().timestamp(),
        "title": payload.title, "message": payload.message,
        "severity": payload.severity, "timestamp": datetime.utcnow().isoformat()
    }

    dead_connections = []
    for connection in ACTIVE_CONNECTIONS:
        try:
            await connection.send_json(alert_json)
        except Exception:
            dead_connections.append(connection)

    for dead in dead_connections:
        if dead in ACTIVE_CONNECTIONS: ACTIVE_CONNECTIONS.remove(dead)

    return {"status": "broadcast_complete", "alert": alert_json}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
