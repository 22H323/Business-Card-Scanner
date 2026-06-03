"""Contact storage backend selection via CONTACT_STORAGE env."""
import os


VALID_STORAGE_MODES = ("postgresql", "firebase", "indexeddb")


def get_contact_storage_mode() -> str:
    raw = os.getenv("CONTACT_STORAGE", "postgresql").strip().lower()
    if raw in VALID_STORAGE_MODES:
        return raw
    return "postgresql"


def is_client_side_storage() -> bool:
    return get_contact_storage_mode() == "indexeddb"
