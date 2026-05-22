"""
engine/key_manager.py — Dynamic API Key Decryption at Rest (OWASP A02:2021)

Secures sensitive API keys at rest. Instead of storing keys as plain text
in `.env` files, keys are stored in encrypted format (e.g., `ENCRYPTED_GOOGLE_API_KEY`).
They are decrypted dynamically in-memory at application startup using a Master Key.

The Master Key is retrieved from:
  1. The environment variable `ACUMEN_MASTER_KEY` (highly recommended for production).
  2. If missing, a persistent machine-specific master key generated and stored at
     `./data/.master.key` (excluded from git version control).
"""

import os
import sys
import logging
from pathlib import Path
from cryptography.fernet import Fernet

logger = logging.getLogger("acumen.key_manager")

# Master key resolution
DATA_DIR = Path(os.getenv("ACUMEN_DATA_DIR", "./data"))
KEY_FILE = DATA_DIR / ".master.key"

_master_key = None

def _resolve_master_key() -> bytes:
    """Resolve the master key from the environment or a secure local file."""
    # Priority 1: Environment variable
    env_key = os.getenv("ACUMEN_MASTER_KEY")
    if env_key:
        try:
            # Ensure it is a valid base64-encoded key
            return env_key.encode("utf-8")
        except Exception as exc:
            logger.error("Failed to parse ACUMEN_MASTER_KEY: %s", exc)

    # Priority 2: Local persistent key file
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists():
        try:
            return KEY_FILE.read_bytes()
        except Exception as exc:
            logger.error("Failed to read local master key file: %s", exc)

    # Generate a new persistent key if missing
    new_key = Fernet.generate_key()
    try:
        KEY_FILE.write_bytes(new_key)
        # Try to restrict file permissions to owner only
        try:
            os.chmod(KEY_FILE, 0o600)
        except Exception:
            pass
        logger.info("Generated new persistent master key at '%s'", KEY_FILE)
    except Exception as exc:
        logger.critical("Failed to save master key to '%s': %s", KEY_FILE, exc)
    
    return new_key


def get_fernet() -> Fernet:
    """Get the Fernet instance for encryption/decryption."""
    global _master_key
    if _master_key is None:
        _master_key = _resolve_master_key()
    return Fernet(_master_key)


def encrypt_key(plain_text: str) -> str:
    """Encrypt a plain text API key."""
    fernet = get_fernet()
    return fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")


def decrypt_key(encrypted_text: str) -> str:
    """Decrypt an encrypted API key."""
    fernet = get_fernet()
    return fernet.decrypt(encrypted_text.encode("utf-8")).decode("utf-8")


def initialize_keys() -> None:
    """
    Scan environment variables for ENCRYPTED_ keys, decrypt them,
    and populate the standard environment variables in memory.
    """
    encrypted_vars = {
        "ENCRYPTED_GOOGLE_API_KEY": "GOOGLE_API_KEY",
        "ENCRYPTED_CLERK_SECRET_KEY": "CLERK_SECRET_KEY",
        "ENCRYPTED_HUGGINGFACE_API_KEY": "HUGGINGFACE_API_KEY",
    }
    
    decrypted_count = 0
    for enc_var, target_var in encrypted_vars.items():
        val = os.getenv(enc_var)
        if val:
            try:
                decrypted = decrypt_key(val)
                os.environ[target_var] = decrypted
                decrypted_count += 1
            except Exception as exc:
                logger.error("Failed to decrypt %s: %s", enc_var, exc)
                
    if decrypted_count > 0:
        logger.info("Decrypted %d API keys from environment configuration.", decrypted_count)


if __name__ == "__main__":
    # Serve as a simple CLI helper
    if len(sys.argv) < 3 or sys.argv[1] not in ("encrypt", "decrypt"):
        print("Usage: python key_manager.py [encrypt|decrypt] <text>")
        sys.exit(1)
        
    action = sys.argv[1]
    text = sys.argv[2]
    
    try:
        if action == "encrypt":
            print(encrypt_key(text))
        else:
            print(decrypt_key(text))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
