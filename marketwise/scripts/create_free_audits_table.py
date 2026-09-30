#!/usr/bin/env python3
"""Create free_audits table for rate limiting the free diagnosis endpoint."""
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from db_query import q

SQL = """
CREATE TABLE IF NOT EXISTS free_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE free_audits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS free_audits_ip_created_idx ON free_audits (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS free_audits_created_idx ON free_audits (created_at DESC);
"""
res = q(SQL)
print(res)
# verify
print(q("SELECT column_name FROM information_schema.columns WHERE table_name='free_audits'"))
