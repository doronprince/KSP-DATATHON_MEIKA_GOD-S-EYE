import os
import sqlite3
from datetime import datetime, timedelta

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
import jwt

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "intelligence_core.db")
SECRET_KEY = os.getenv("JWT_SECRET", "ksp_datathon_super_secret_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("sub") is None:
            raise credentials_exception
        return payload
    except jwt.PyJWTError:
        raise credentials_exception

def log_audit(kgid: str, action: str, query: str = "") -> None:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kgid TEXT,
            action TEXT,
            query_executed TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        cur.execute(
            "INSERT INTO audit_logs (kgid, action, query_executed) VALUES (?, ?, ?)",
            (kgid, action, query),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Audit Log Failed: {e}")