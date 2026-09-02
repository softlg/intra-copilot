#!/usr/bin/env python3
"""Copy legacy SQLite data into PostgreSQL after Flyway initialization.

Requires psycopg[binary]. The source SQLite database is never modified.
"""

import argparse
import os
import sqlite3

import psycopg


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", default="../intra-copilot.db")
    parser.add_argument(
        "--postgres",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://intra:intra@127.0.0.1:5432/intra_copilot",
        ),
    )
    args = parser.parse_args()

    source = sqlite3.connect(args.sqlite)
    source.row_factory = sqlite3.Row
    with psycopg.connect(args.postgres) as target:
        with target.cursor() as cursor:
            for row in source.execute(
                "SELECT id, title, created_at, updated_at FROM conversation"
            ):
                cursor.execute(
                    """INSERT INTO conversation (id, title, created_at, updated_at)
                       VALUES (%s, %s, to_timestamp(%s), to_timestamp(%s))
                       ON CONFLICT (id) DO NOTHING""",
                    (row["id"], row["title"], row["created_at"], row["updated_at"]),
                )
            for row in source.execute(
                "SELECT id, conversation_id, role, content, agent_id, context_summary, created_at FROM message"
            ):
                cursor.execute(
                    """INSERT INTO message (id, conversation_id, role, content, agent_id, context_summary, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, to_timestamp(%s))
                       ON CONFLICT (id) DO NOTHING""",
                    tuple(row),
                )
            for row in source.execute(
                "SELECT action_id, conversation_id, type, target, arguments, reason, risk, expires_at, status, result FROM action_proposal"
            ):
                cursor.execute(
                    """INSERT INTO action_proposal (action_id, conversation_id, type, target, arguments, reason, risk, expires_at, status, result)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, to_timestamp(%s), %s, %s)
                       ON CONFLICT (action_id) DO NOTHING""",
                    tuple(row),
                )
        target.commit()
    source.close()
    print("SQLite data copied successfully; source database was not modified.")


if __name__ == "__main__":
    main()
