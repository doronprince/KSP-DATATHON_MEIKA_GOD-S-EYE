# init_auth_db.py
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "intelligence_core.db")


def setup_security_tables():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("Creating secure tables...")

    # 1. Users Table (No mock data inserted)
    cur.execute('''
                CREATE TABLE IF NOT EXISTS users
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
                )
                ''')

    # 2. Audit Logs Table (Module 10 Requirement)
    cur.execute('''
                CREATE TABLE IF NOT EXISTS audit_logs
                (
                    log_id
                    INTEGER
                    PRIMARY
                    KEY
                    AUTOINCREMENT,
                    timestamp
                    DATETIME
                    DEFAULT
                    CURRENT_TIMESTAMP,
                    kgid
                    TEXT,
                    action
                    TEXT,
                    query_executed
                    TEXT
                )
                ''')

    conn.commit()
    conn.close()
    print("Security tables created. System is ready for official K.G.I.D. registrations.")


if __name__ == "__main__":
    setup_security_tables()