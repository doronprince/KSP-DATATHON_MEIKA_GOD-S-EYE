import sqlite3

# Connect to your God's Eye database (ensure the name matches your actual db file)
conn = sqlite3.connect("intelligence_core.db")
cursor = conn.cursor()

# Get a list of all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()

print("TABLES CURRENTLY IN DATABASE:")
for table in tables:
    print(f"- {table[0]}")

conn.close()