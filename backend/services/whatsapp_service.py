import os
from pathlib import Path

import requests
from dotenv import load_dotenv

root_env = Path(__file__).resolve().parents[2] / ".env"
backend_env = Path(__file__).resolve().parents[1] / ".env"

load_dotenv(root_env)
load_dotenv(backend_env, override=True)


def _normalize_env(value):
    if not value:
        return ""
    return value.strip().strip('"').strip("'")

ACCESS_TOKEN = _normalize_env(os.getenv("WHATSAPP_ACCESS_TOKEN"))
PHONE_NUMBER_ID = _normalize_env(os.getenv("WHATSAPP_PHONE_NUMBER_ID"))

print("TOKEN =", ACCESS_TOKEN[:15] if ACCESS_TOKEN else "NONE")
print("PHONE_ID =", PHONE_NUMBER_ID)

GRAPH_API_VERSION = _normalize_env(os.getenv("WHATSAPP_GRAPH_API_VERSION")) or "v20.0"
TEMPLATE_NAME = _normalize_env(os.getenv("WHATSAPP_TEMPLATE_NAME")) or "hello_world"
TEMPLATE_LANGUAGE_CODE = _normalize_env(os.getenv("WHATSAPP_TEMPLATE_LANGUAGE_CODE")) or "en_US"

if not ACCESS_TOKEN or not PHONE_NUMBER_ID:
    raise RuntimeError(
        "Missing WhatsApp config. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID "
        f"in {root_env} or {backend_env}."
    )


def _format_whatsapp_error(error_json):
    if not error_json:
        return "Unknown WhatsApp API error."

    if isinstance(error_json, dict):
        error = error_json.get("error") or error_json
        code = error.get("code")
        message = error.get("message")
        subcode = error.get("error_subcode")
        type_ = error.get("type")

        if code == 190:
            if subcode == 463:
                return (
                    "WhatsApp OAuth error 190/463: the access token session has expired. "
                    "Get a fresh WHATSAPP_ACCESS_TOKEN from your Facebook/Meta developer app settings."
                )
            return (
                "WhatsApp OAuth error 190: invalid or expired access token. "
                "Refresh WHATSAPP_ACCESS_TOKEN from your Facebook/Meta developer app settings."
            )

        if message:
            details = f"{message}"
            if code:
                details = f"{details} (code={code}"
                if subcode:
                    details += f", subcode={subcode}"
                details += ")"
            return details

    return "Unknown WhatsApp API error."


def send_whatsapp(phone, name):
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": TEMPLATE_NAME,
            "language": {
                "code": TEMPLATE_LANGUAGE_CODE
            }
        }
    }

    response = requests.post(url, headers=headers, json=payload)

    try:
        response_json = response.json()
    except ValueError:
        raise RuntimeError(
            f"WhatsApp send failed: invalid JSON response (status {response.status_code}). "
            f"Response body: {response.text}"
        )

    if response.status_code >= 400:
        error_message = _format_whatsapp_error(response_json)
        raise RuntimeError(
            "WhatsApp send failed: " + error_message
        )

    return response_json


    print("TOKEN:", ACCESS_TOKEN)
    print("PHONE_ID:", PHONE_NUMBER_ID)