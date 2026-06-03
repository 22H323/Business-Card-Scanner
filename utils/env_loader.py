"""Load .env from project root into os.environ (does not override existing vars)."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
_ENV_LOADED = False


def load_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    try:
        from dotenv import load_dotenv
    except ImportError:
        _ENV_LOADED = True
        return

    env_file = PROJECT_ROOT / ".env"
    if env_file.is_file():
        load_dotenv(env_file, override=False)

    # Zoho OAuth secrets often live here; override empty placeholders from root .env
    backend_env = PROJECT_ROOT / "backend" / ".env"
    if backend_env.is_file():
        load_dotenv(backend_env, override=True)

    # Root .env always wins for WhatsApp so backend/.env cannot override tokens/phone id.
    whatsapp_keys = (
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_GRAPH_API_VERSION",
        "WHATSAPP_TEMPLATE_NAME",
        "WHATSAPP_TEMPLATE_LANGUAGE_CODE",
        "WHATSAPP_SCAN_TEMPLATE_NAME",
        "WHATSAPP_BUSINESS_CARD_TEMPLATE_NAME",
    )
    if env_file.is_file():
        try:
            from dotenv import dotenv_values

            root_values = dotenv_values(env_file)
            for key in whatsapp_keys:
                value = root_values.get(key)
                if value:
                    os.environ[key] = value.strip().strip('"').strip("'")
        except Exception:
            load_dotenv(env_file, override=True)

    _ENV_LOADED = True
