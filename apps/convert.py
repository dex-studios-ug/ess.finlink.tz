#!/usr/bin/env python3
import subprocess
import shutil
from pathlib import Path
import sys
st="/etc/letsencrypt/live/postakk.finlinktz.net/"
# Filenames (symlinks in current folder)
key_symlink = Path(st+"privkey.pem")
cert_symlink = Path(st+"fullchain.pem")

# Resolve symlinks to real files
def resolve_symlink(p: Path) -> Path:
    if not p.exists():
        print(f"❌ File not found: {p}")
        sys.exit(1)
    try:
        return p.resolve(strict=True)
    except FileNotFoundError:
        print(f"❌ Could not resolve symlink: {p}")
        sys.exit(1)

key_real = resolve_symlink(key_symlink)
cert_real = resolve_symlink(cert_symlink)

# Copy to current folder
key_local = Path("./key.pem")
cert_local = Path("./cert.pem")
shutil.copy2(key_real, key_local)
shutil.copy2(cert_real, cert_local)

print(f"✅ Using key:  {key_local}")
print(f"✅ Using cert: {cert_local}")

# Output filenames
p12_file = Path("keystore.p12")
jks_file = Path("keystore.jks")
p12_pass = "spike#@1012"
jks_pass = "spike#@1012"
alias = "mykey"

# Step 1: Create PKCS#12 bundle
subprocess.run([
    "openssl", "pkcs12", "-export",
    "-inkey", str(key_local),
    "-in", str(cert_local),
    "-out", str(p12_file),
    "-name", alias,
    "-password", f"pass:{p12_pass}"
], check=True)

# Step 2: Import PKCS#12 into JKS
subprocess.run([
    "keytool", "-importkeystore",
    "-deststorepass", jks_pass,
    "-destkeypass", jks_pass,
    "-destkeystore", str(jks_file),
    "-srckeystore", str(p12_file),
    "-srcstoretype", "PKCS12",
    "-srcstorepass", p12_pass,
    "-alias", alias
], check=True)

print(f"🎉 Done. Keystore created: {jks_file}")

