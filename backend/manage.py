"""Local operator commands, no credentials echoed."""
import argparse
import getpass
from pathlib import Path
from .db import connection
from .security import hash_password

def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['migrate','create-admin']);p.add_argument('--username');args=p.parse_args()
    if args.command=='migrate':
        with connection() as c:
            c.execute('CREATE TABLE IF NOT EXISTS el_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())')
            for f in sorted(Path(__file__).parent.joinpath('sql').glob('*.sql')):
                if not c.execute('SELECT 1 FROM el_migrations WHERE name=%s',(f.name,)).fetchone():
                    c.execute(f.read_text());c.execute('INSERT INTO el_migrations(name) VALUES(%s)',(f.name,))
        print('Incremental migrations applied')
    else:
        password=getpass.getpass('Admin password (12+ characters): ')
        if len(password)<12: raise SystemExit('Password too short')
        username=args.username or input('Username: ')
        with connection() as c: c.execute("INSERT INTO el_users(username,password_hash,role) VALUES(%s,%s,'admin')",(username,hash_password(password)))
        print('Admin created')
if __name__=='__main__':main()
