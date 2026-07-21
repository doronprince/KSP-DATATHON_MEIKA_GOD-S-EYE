import sqlite3
import pandas as pd
import os

def build_database_from_csvs():
    db_name = "intelligence_core.db"
    conn = sqlite3.connect(db_name)

    csv_files = {
        "state": "data/state.csv",
        "district": "data/district.csv",
        "unit_type": "data/unit_type.csv",
        "unit": "data/unit.csv",
        "rank": "data/rank.csv",
        "designation": "data/designation.csv",
        "employee": "data/employee.csv",
        "case_category": "data/case_category.csv",
        "gravity_offence": "data/gravity_offence.csv",
        "case_status_master": "data/case_status_master.csv",
        "court": "data/court.csv",
        "act": "data/act.csv",
        "section": "data/section.csv",
        "crime_head": "data/crime_head.csv",
        "crime_sub_head": "data/crime_sub_head.csv",
        "crime_head_act_section": "data/crime_head_act_section.csv",
        "caste_master": "data/caste_master.csv",
        "religion_master": "data/religion_master.csv",
        "occupation_master": "data/occupation_master.csv",
        "case_master": "data/case_master.csv",
        "complainant_details": "data/complainant_details.csv",
        "act_section_association": "data/act_section_association.csv",
        "victim": "data/victim.csv",
        "accused": "data/accused.csv",
        "arrest_surrender": "data/arrest_surrender.csv",
        "chargesheet_details": "data/chargesheet_details.csv",
        "telecom_logs": "data/telecom_logs.csv",
        "cctv_metadata": "data/cctv_metadata.csv",
        "financial_transactions": "data/financial_transactions.csv"
    }

    print(f"Initializing God's Eye Database: {db_name}...")

    for table_name, file_path in csv_files.items():
        if os.path.exists(file_path):
            try:
                df = pd.read_csv(file_path)
                df.to_sql(table_name, conn, if_exists="replace", index=False)
                print(f" [+] Successfully loaded '{file_path}' into table '{table_name}'. (Rows: {len(df)})")
            except Exception as e:
                print(f" [!] Error loading {file_path}: {e}")
        else:
            print(f" [!] Warning: Could not find {file_path}. Skipping.")

    conn.close()
    print("Database build complete. Ready for Grok integration.")

if __name__ == "__main__":
    build_database_from_csvs()
