import os
import sqlite3
from typing import Dict, List, Optional, Set, Tuple
from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel

from auth import get_current_user, log_audit, DB_PATH

router = APIRouter()

MAX_NODES = 150

class NetworkNode(BaseModel):
    id: str
    label: str
    type: str
    meta: dict = {}

class NetworkEdge(BaseModel):
    source: str
    target: str
    relation: str

class NetworkGraph(BaseModel):
    nodes: List[NetworkNode]
    edges: List[NetworkEdge]

def get_conn() -> sqlite3.Connection:
    uri = f"file:{DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn

@router.get("/api/network", response_model=NetworkGraph)
async def network_analysis(
    query: str = Query(..., min_length=1, description="Name, crime number, or phone number"),
    depth: int = Query(1, ge=1, le=3, description="How many relationship hops to expand"),
    current_user: dict = Depends(get_current_user),
):
    kgid = current_user.get("sub")
    log_audit(kgid, "NETWORK_GRAPH_TRAVERSAL", f"Target: {query} | Depth: {depth}")

    conn = get_conn()
    cur = conn.cursor()

    nodes: Dict[str, NetworkNode] = {}
    edges: List[NetworkEdge] = []
    seen_edges: Set[Tuple[str, str, str]] = set()

    def add_node(node_id: str, label, ntype: str, meta: Optional[dict] = None):
        if node_id not in nodes and len(nodes) < MAX_NODES:
            safe_label = str(label) if label is not None else node_id
            nodes[node_id] = NetworkNode(id=node_id, label=safe_label, type=ntype, meta=meta or {})

    def add_edge(source: str, target: str, relation: str):
        if source not in nodes or target not in nodes: return
        key = tuple(sorted([source, target])) + (relation,)
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append(NetworkEdge(source=source, target=target, relation=relation))

    like = f"%{query}%"

    seed_rows = cur.execute(
        """
        SELECT DISTINCT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts
        FROM case_master cm
        LEFT JOIN accused a ON a.CaseMasterID = cm.CaseMasterID
        LEFT JOIN victim v ON v.CaseMasterID = cm.CaseMasterID
        WHERE cm.CrimeNo LIKE ? OR a.AccusedName LIKE ? OR v.VictimName LIKE ?
        LIMIT 25
        """,
        (like, like, like),
    ).fetchall()

    frontier_case_ids: Set[int] = set()
    for row in seed_rows:
        case_id = f"case:{row['CaseMasterID']}"
        add_node(case_id, row["CrimeNo"] or f"Case {row['CaseMasterID']}", "case", {"brief_facts": row["BriefFacts"]})
        frontier_case_ids.add(row["CaseMasterID"])

    frontier_accused_names: Set[str] = set()
    visited_case_ids: Set[int] = set()

    hop = 0
    while hop < depth and (frontier_case_ids or frontier_accused_names) and len(nodes) < MAX_NODES:
        next_case_ids: Set[int] = set()
        next_accused_names: Set[str] = set()

        for cmid in frontier_case_ids:
            if cmid in visited_case_ids: continue
            visited_case_ids.add(cmid)
            case_id = f"case:{cmid}"

            for a in cur.execute("SELECT AccusedMasterID, AccusedName, AgeYear FROM accused WHERE CaseMasterID = ?", (cmid,)).fetchall():
                acc_id = f"accused:{a['AccusedMasterID']}"
                add_node(acc_id, a["AccusedName"], "accused", {"age": a["AgeYear"]})
                add_edge(case_id, acc_id, "ACCUSED_IN")
                next_accused_names.add(a["AccusedName"])

            for v in cur.execute("SELECT VictimMasterID, VictimName FROM victim WHERE CaseMasterID = ?", (cmid,)).fetchall():
                vic_id = f"victim:{v['VictimMasterID']}"
                add_node(vic_id, v["VictimName"], "victim")
                add_edge(case_id, vic_id, "VICTIM_IN")

        for name in frontier_accused_names:
            for a in cur.execute("SELECT AccusedMasterID FROM accused WHERE AccusedName = ?", (name,)).fetchall():
                acc_id = f"accused:{a['AccusedMasterID']}"

                for other_case in cur.execute("""
                    SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts
                    FROM case_master cm JOIN accused ac ON ac.CaseMasterID = cm.CaseMasterID
                    WHERE ac.AccusedMasterID = ?
                """, (a["AccusedMasterID"],)).fetchall():
                    other_case_id = f"case:{other_case['CaseMasterID']}"
                    add_node(other_case_id, other_case["CrimeNo"] or f"Case {other_case['CaseMasterID']}", "case", {"brief_facts": other_case["BriefFacts"]})
                    add_edge(acc_id, other_case_id, "ALSO_ACCUSED_IN")
                    if other_case["CaseMasterID"] not in visited_case_ids:
                        next_case_ids.add(other_case["CaseMasterID"])

                for t in cur.execute("SELECT phone_number, frequent_towers, associated_contacts FROM telecom_logs WHERE target_name = ?", (name,)).fetchall():
                    phone_id = f"phone:{t['phone_number']}"
                    add_node(phone_id, t["phone_number"], "phone", {"towers": t["frequent_towers"]})
                    add_edge(acc_id, phone_id, "HAS_PHONE")

                    if t["associated_contacts"]:
                        for contact in str(t["associated_contacts"]).split(","):
                            if not contact.strip(): continue
                            contact_id = f"contact:{contact.strip()}"
                            add_node(contact_id, contact.strip(), "contact")
                            add_edge(phone_id, contact_id, "CONTACTED")

        frontier_case_ids = next_case_ids
        frontier_accused_names = next_accused_names
        hop += 1

    conn.close()
    return NetworkGraph(nodes=list(nodes.values()), edges=edges)
