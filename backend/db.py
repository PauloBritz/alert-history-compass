import os
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row

@contextmanager
def connection():
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise RuntimeError('DATABASE_URL não configurada')
    with psycopg.connect(url, row_factory=dict_row) as conn:
        yield conn
