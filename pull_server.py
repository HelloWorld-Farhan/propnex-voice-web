import paramiko
import sys

import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    vps_pass = os.environ.get('VPS_PASSWORD', '')
    ssh.connect('200.234.34.240', username='root', password=vps_pass, timeout=10)
    
    commands = [
        "cd /root/propnex-voice-web && git rebase --abort",
        "cd /root/propnex-voice-web && git reset --hard HEAD"
    ]
    
    for cmd in commands:
        print(f"--- Running: {cmd} ---")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        while True:
            line = stdout.readline()
            if not line:
                break
            try:
                sys.stdout.write(line)
            except UnicodeEncodeError:
                pass
            
        err = stderr.read().decode()
        if err:
            print("STDERR:", err)
        
finally:
    ssh.close()
