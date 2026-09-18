import paramiko
import sys
import os

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("95.85.253.133", username="root", password="n8o97vqac3w45")

sftp = client.open_sftp()
files = [
    ("E:/vessel/apps/vessel-server/src/main.rs", "/opt/vessel/src/apps/vessel-server/src/main.rs"),
    ("E:/vessel/src/provider/download.rs", "/opt/vessel/src/src/provider/download.rs")
]

for local, remote in files:
    sftp.put(local, remote)
    print(f"Uploaded {local} -> {remote}")

sftp.close()

print("Building on VPS...")
build_cmd = "export CARGO_HOME=/opt/vessel/cargo RUSTUP_HOME=/opt/vessel/rustup PATH=/opt/vessel/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; cd /opt/vessel/src && cargo build --release -p vessel-server"
stdin, stdout, stderr = client.exec_command(build_cmd)
status = stdout.channel.recv_exit_status()
if status != 0:
    print(stderr.read().decode())
    sys.exit(1)

print("Deploying on VPS...")
install_cmd = "cp /opt/vessel/src/target/release/vessel-server /opt/vessel/bin/vessel-server && cp /opt/vessel/src/target/release/vessel-server /opt/vessel/vessel-server && systemctl restart vessel-server"
stdin, stdout, stderr = client.exec_command(install_cmd)
status = stdout.channel.recv_exit_status()
print("Restart status:", status)
client.close()
