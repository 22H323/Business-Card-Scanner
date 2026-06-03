import asyncio
import logging
import os
import re
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

_RECENT_SENDS: dict[str, float] = {}
_SEND_DEDUPE_SECONDS = 120


def _auto_send_enabled() -> bool:
    return _normalize_env(os.getenv("WHATSAPP_AUTO_SEND_ON_SCAN")).lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _normalize_env(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().strip('"').strip("'")


ACCESS_TOKEN = _normalize_env(os.getenv("WHATSAPP_ACCESS_TOKEN"))
PHONE_NUMBER_ID = _normalize_env(os.getenv("WHATSAPP_PHONE_NUMBER_ID"))
GRAPH_API_VERSION = _normalize_env(os.getenv("WHATSAPP_GRAPH_API_VERSION")) or "v25.0"
TEMPLATE_NAME = _normalize_env(os.getenv("WHATSAPP_TEMPLATE_NAME")) or "hello_world"
TEMPLATE_LANGUAGE_CODE = _normalize_env(os.getenv("WHATSAPP_TEMPLATE_LANGUAGE_CODE")) or "en_US"
SCAN_THANKS_TEMPLATE_NAME = (
    _normalize_env(os.getenv("WHATSAPP_SCAN_TEMPLATE_NAME")) or "cardsync_scan_thanks"
)
BUSINESS_CARD_TEMPLATE_NAME = (
    _normalize_env(os.getenv("WHATSAPP_BUSINESS_CARD_TEMPLATE_NAME")) or "cardsync_contact_saved"
)


def is_whatsapp_configured() -> bool:
    return bool(ACCESS_TOKEN and PHONE_NUMBER_ID)


def normalize_whatsapp_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        raise ValueError("Phone number is required.")
    if len(digits) == 10 and digits[0] in "6789":
        return f"91{digits}"
    return digits


def _format_whatsapp_error(error_json: Any) -> str:
    if not error_json:
        return "Unknown WhatsApp API error."

    if isinstance(error_json, dict):
        error = error_json.get("error") or error_json
        code = error.get("code")
        message = error.get("message")
        subcode = error.get("error_subcode")

        if code == 190:
            if subcode == 463:
                return (
                    "WhatsApp OAuth error 190/463: the access token session has expired. "
                    "Generate a fresh permanent System User token in Meta Business Manager."
                )
            return (
                "WhatsApp OAuth error 190: invalid or expired access token. "
                "Generate a fresh WHATSAPP_ACCESS_TOKEN from Meta Business Manager."
            )

        if message:
            details = f"{message}"
            if code == 131030:
                return (
                    "Recipient phone number is not in Meta's WhatsApp test list. "
                    "In development mode Meta only delivers to pre-approved test numbers. "
                    "Move your WhatsApp app to Live mode in Meta Business Manager to send "
                    "dynamically to any scanned card holder number."
                )
            if code:
                details = f"{details} (code={code}"
                if subcode:
                    details += f", subcode={subcode}"
                details += ")"
            return details

    return "Unknown WhatsApp API error."


def _post_message(payload: dict[str, Any]) -> dict[str, Any]:
    if not is_whatsapp_configured():
        raise RuntimeError(
            "Missing WhatsApp config. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env."
        )

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    response = requests.post(url, headers=headers, json=payload, timeout=30)

    try:
        response_json = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"WhatsApp send failed: invalid JSON response (status {response.status_code}). "
            f"Response body: {response.text}"
        ) from exc

    if response.status_code >= 400:
        raise RuntimeError("WhatsApp send failed: " + _format_whatsapp_error(response_json))

    return response_json


def send_whatsapp_text(phone: str, message: str) -> dict[str, Any]:
    payload = {
        "messaging_product": "whatsapp",
        "to": normalize_whatsapp_phone(phone),
        "type": "text",
        "text": {"body": message},
    }
    return _post_message(payload)


def send_whatsapp_template(
    phone: str,
    template_name: str | None = None,
    language_code: str | None = None,
    components: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    template: dict[str, Any] = {
        "name": template_name or TEMPLATE_NAME,
        "language": {"code": language_code or TEMPLATE_LANGUAGE_CODE},
    }
    if components:
        template["components"] = components

    payload = {
        "messaging_product": "whatsapp",
        "to": normalize_whatsapp_phone(phone),
        "type": "template",
        "template": template,
    }
    return _post_message(payload)


def send_business_card_template(
    phone: str,
    contact_name: str,
    company: str = "",
    title: str = "",
) -> dict[str, Any]:
    first_name = (contact_name or "there").strip().split()[0]
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": first_name},
                {"type": "text", "text": contact_name or "—"},
                {"type": "text", "text": company or "—"},
                {"type": "text", "text": title or "—"},
            ],
        }
    ]
    return send_whatsapp_template(
        phone,
        template_name=BUSINESS_CARD_TEMPLATE_NAME,
        language_code=TEMPLATE_LANGUAGE_CODE,
        components=components,
    )


def extract_contact_name(contact: dict[str, Any]) -> str:
    for key in ("fullName", "name"):
        value = str(contact.get(key) or "").strip()
        if value:
            return value

    first = str(contact.get("firstName") or "").strip()
    last = str(contact.get("lastName") or "").strip()
    combined = f"{first} {last}".strip()
    if combined:
        return combined
    return ""


def extract_company_name(contact: dict[str, Any]) -> str:
    for key in ("company", "companyName"):
        value = str(contact.get(key) or "").strip()
        if value:
            return value
    return ""


def build_scan_thank_you_text(contact_name: str, company: str = "") -> str:
    first_name = (contact_name or "there").strip().split()[0]
    company_bit = f" from {company}" if company else ""
    return (
        f"Hi {first_name}, thank you for sharing your business card{company_bit}. "
        "We have saved your details in CardSync."
    )


def _requires_template_message(error: Exception) -> bool:
    error_text = str(error).lower()
    return any(
        token in error_text
        for token in ("template", "24 hour", "24-hour", "session", "re-engagement")
    )


def send_scan_thank_you_to_contact(contact: dict[str, Any]) -> dict[str, Any]:
    """Send a personalized thank-you to the card holder's extracted phone number."""
    phone = extract_primary_phone(contact)
    if not phone:
        raise ValueError("No primary phone number found on the contact.")

    contact_name = extract_contact_name(contact)
    company = extract_company_name(contact)
    message = build_scan_thank_you_text(contact_name, company)
    normalized_phone = normalize_whatsapp_phone(phone)
    first_name = (contact_name or "there").strip().split()[0]

    # Business API outbound: approved templates first (same as Meta curl hello_world).
    # Free-text only works inside an existing 24-hour customer session.
    result = None
    send_mode = TEMPLATE_NAME
    last_error: Exception | None = None

    for mode, sender in (
        (
            SCAN_THANKS_TEMPLATE_NAME,
            lambda: send_whatsapp_template(
                phone,
                template_name=SCAN_THANKS_TEMPLATE_NAME,
                language_code=TEMPLATE_LANGUAGE_CODE,
                components=[
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": first_name}],
                    }
                ],
            ),
        ),
        (TEMPLATE_NAME, lambda: send_whatsapp_template(phone, template_name=TEMPLATE_NAME)),
        ("text", lambda: send_whatsapp_text(phone, message)),
    ):
        try:
            result = sender()
            send_mode = mode
            break
        except RuntimeError as exc:
            last_error = exc
            logger.info("WhatsApp send mode %s failed for %s: %s", mode, normalized_phone, exc)

    if result is None:
        raise last_error or RuntimeError("WhatsApp send failed for all message modes.")

    return {
        "result": result,
        "phone": phone,
        "normalized_phone": normalized_phone,
        "recipient_name": contact_name or first_name,
        "message": message,
        "send_mode": send_mode,
    }


def extract_primary_phone(contact: dict[str, Any]) -> str:
    for key in ("phone", "phoneNumber", "primaryPhone"):
        value = str(contact.get(key) or "").strip()
        if value:
            return value

    for key in ("phones", "mobileNumbers", "telephoneNumbers"):
        values = contact.get(key) or []
        if isinstance(values, list):
            for value in values:
                text = str(value or "").strip()
                if text:
                    return text
    return ""


def _should_send_to_phone(phone: str) -> bool:
    try:
        normalized = normalize_whatsapp_phone(phone)
    except ValueError:
        return False

    now = time.time()
    last_sent = _RECENT_SENDS.get(normalized, 0)
    if now - last_sent < _SEND_DEDUPE_SECONDS:
        logger.info("Skipping duplicate WhatsApp send to %s within dedupe window.", normalized)
        return False

    _RECENT_SENDS[normalized] = now
    return True


async def schedule_whatsapp_for_contact(
    contact: dict[str, Any],
    *,
    online_mode: bool = True,
    on_zoho_sync: bool = False,
    contact_id: str | None = None,
    skip_if_already_sent: bool = True,
) -> dict[str, Any]:
    """
    Send a dummy WhatsApp template to the contact's primary phone.

    Returns a result dict with attempted/sent/error/message_id fields.
    """
    skipped = {
        "attempted": False,
        "sent": False,
        "queued": False,
        "error": None,
        "message_id": None,
        "recipient_phone": None,
        "recipient_name": None,
        "message": None,
        "send_mode": None,
    }

    if not _auto_send_enabled():
        logger.debug("WhatsApp auto-send disabled via WHATSAPP_AUTO_SEND_ON_SCAN.")
        skipped["error"] = "WhatsApp auto-send is disabled."
        return skipped

    if not on_zoho_sync and not online_mode:
        logger.info("WhatsApp auto-send skipped: offline mode (will send on Zoho sync).")
        skipped["error"] = "Offline mode — WhatsApp will send when you sync to Zoho."
        return skipped

    if not is_whatsapp_configured():
        logger.warning("WhatsApp auto-send skipped: missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.")
        skipped["error"] = "WhatsApp is not configured in .env."
        return skipped

    if contact_id and skip_if_already_sent:
        from services import contact_storage as storage

        existing = storage.get_contact(contact_id)
        if existing and storage.has_whatsapp_sent(existing):
            logger.info("WhatsApp auto-send skipped: already sent for contact %s.", contact_id)
            skipped["error"] = "WhatsApp template was already sent for this contact."
            return skipped

    phone = extract_primary_phone(contact)
    if not phone:
        logger.info("WhatsApp auto-send skipped: no primary phone on scanned contact.")
        skipped["error"] = "No primary phone number found on the contact."
        return skipped

    contact_name = extract_contact_name(contact)
    skipped["recipient_phone"] = phone
    skipped["recipient_name"] = contact_name or None
    skipped["message"] = build_scan_thank_you_text(contact_name, extract_company_name(contact))
    logger.info(
        "WhatsApp dynamic send -> extracted phone=%s name=%s",
        normalize_whatsapp_phone(phone),
        contact_name or "unknown",
    )

    if not _should_send_to_phone(phone):
        skipped["error"] = "Duplicate WhatsApp send skipped for this number."
        return skipped

    try:
        delivery = await asyncio.to_thread(send_scan_thank_you_to_contact, contact)
        result = delivery["result"]
        message_id = (result.get("messages") or [{}])[0].get("id")
        logger.info(
            "WhatsApp thank-you sent to %s (%s) via %s (id=%s)",
            delivery["normalized_phone"],
            delivery["recipient_name"],
            delivery["send_mode"],
            message_id,
        )
        if contact_id:
            from services import contact_storage as storage

            await asyncio.to_thread(storage.mark_whatsapp_sent, contact_id)
        return {
            "attempted": True,
            "sent": True,
            "queued": False,
            "error": None,
            "message_id": message_id,
            "recipient_phone": delivery["phone"],
            "recipient_name": delivery["recipient_name"],
            "message": delivery["message"],
            "send_mode": delivery["send_mode"],
        }
    except Exception as exc:
        error_message = str(exc)
        logger.error("WhatsApp auto-send failed for %s: %s", phone, error_message, exc_info=True)
        return {
            "attempted": True,
            "sent": False,
            "queued": False,
            "error": error_message,
            "message_id": None,
            "recipient_phone": phone,
            "recipient_name": contact_name or None,
            "message": build_scan_thank_you_text(contact_name, extract_company_name(contact)),
            "send_mode": None,
        }


# Backwards-compatible alias
async def schedule_whatsapp_for_scanned_contact(contact: dict[str, Any], **kwargs) -> dict[str, Any]:
    return await schedule_whatsapp_for_contact(contact, **kwargs)


def send_whatsapp_message(phone: str, message: str) -> dict[str, Any]:
    """Send a text message; fall back to the default template if outside the 24h session window."""
    try:
        return send_whatsapp_text(phone, message)
    except RuntimeError as exc:
        error_text = str(exc).lower()
        if "template" not in error_text and "24" not in error_text and "session" not in error_text:
            raise
        logger.info("Text message blocked by WhatsApp session rules; falling back to template.")
        return send_whatsapp_template(phone)


class WhatsAppQueue:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.worker_task = None
        self.is_running = False

    async def start(self):
        if not self.is_running:
            self.is_running = True
            self.worker_task = asyncio.create_task(self._worker())
            logger.info("WhatsApp background worker started.")

    async def stop(self):
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            logger.info("WhatsApp background worker stopped.")

    async def enqueue_message(self, phone: str, message: str):
        item = {"type": "text", "phone": phone, "message": message}
        await self.queue.put(item)
        logger.info("Message enqueued for %s. Queue size: %s", phone, self.queue.qsize())

    async def enqueue_template(
        self,
        phone: str,
        template_name: str | None = None,
        language_code: str | None = None,
        contact_id: str | None = None,
    ):
        item = {
            "type": "template",
            "phone": phone,
            "template_name": template_name,
            "language_code": language_code,
            "contact_id": contact_id,
        }
        await self.queue.put(item)
        logger.info("Template enqueued for %s. Queue size: %s", phone, self.queue.qsize())

    async def _worker(self):
        while self.is_running:
            try:
                item = await self.queue.get()
                phone = item["phone"]
                item_type = item.get("type", "text")

                logger.info("Processing WhatsApp %s message to %s...", item_type, phone)
                if item_type == "template":
                    result = await asyncio.to_thread(
                        send_whatsapp_template,
                        phone,
                        item.get("template_name"),
                        item.get("language_code"),
                    )
                else:
                    result = await asyncio.to_thread(
                        send_whatsapp_message,
                        phone,
                        item.get("message", ""),
                    )
                message_id = (result.get("messages") or [{}])[0].get("id")
                logger.info("WhatsApp message sent to %s (id=%s)", phone, message_id)
                contact_id = item.get("contact_id")
                if contact_id:
                    from services import contact_storage as storage

                    await asyncio.to_thread(storage.mark_whatsapp_sent, contact_id)
                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error processing WhatsApp message: %s", e, exc_info=True)
                self.queue.task_done()


whatsapp_queue = WhatsAppQueue()
