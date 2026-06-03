import json
import logging
import asyncio
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from services.contact_service import (
    delete_all_contacts,
    delete_contact,
    find_duplicate_contacts,
    get_all_contacts,
    save_contact,
    sync_all_pending_to_zoho,
    sync_contact_to_zoho,
    update_contact,
)
from services import contact_storage as storage
from services.contact_storage import ContactStorageError
from services.local_db_service import LocalDbError
from services.zoho_service import ZohoError, delete_all_leads, delete_lead, format_zoho_error_message
from utils.file_utils import validate_file, save_temp_file, cleanup_temp_file
from services.ocr_service import process_card_image
from utils.parser_utils import parse_business_card
from services.whatsapp_service import schedule_whatsapp_for_contact, whatsapp_queue
from services.email_service import email_queue, schedule_email_for_contact

router = APIRouter(tags=["OCR", "Contacts"])
logger = logging.getLogger(__name__)

def _is_online_mode(value: str | None) -> bool:
    return str(value or "online").strip().lower() != "offline"


def _whatsapp_response(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "whatsapp_queued": result.get("sent", False),
        "whatsapp_sent": result.get("sent", False),
        "whatsapp_error": result.get("error"),
        "whatsapp_to": result.get("recipient_phone"),
        "whatsapp_recipient_name": result.get("recipient_name"),
        "whatsapp_message": result.get("message"),
        "whatsapp_send_mode": result.get("send_mode"),
    }


def _email_response(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "email_queued": result.get("sent", False),
        "email_sent": result.get("sent", False),
        "email_error": result.get("error"),
        "email_to": result.get("recipient_email"),
        "email_extracted": result.get("extracted_email"),
        "email_subject": result.get("subject"),
    }


async def _schedule_outreach_for_contact(
    contact: dict[str, Any],
    *,
    online_mode: bool = True,
    on_zoho_sync: bool = False,
    contact_id: str | None = None,
    skip_whatsapp: bool = False,
    skip_email: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Send WhatsApp and email thank-you messages in parallel when enabled."""
    outreach_kwargs = {
        "online_mode": online_mode,
        "on_zoho_sync": on_zoho_sync,
        "contact_id": contact_id,
    }
    whatsapp_result: dict[str, Any] = {"sent": False, "error": None}
    email_result: dict[str, Any] = {"sent": False, "error": None}

    tasks: list[tuple[str, Any]] = []
    if not skip_whatsapp:
        tasks.append(("whatsapp", schedule_whatsapp_for_contact(contact, **outreach_kwargs)))
    if not skip_email:
        tasks.append(("email", schedule_email_for_contact(contact, **outreach_kwargs)))

    if tasks:
        results = await asyncio.gather(*(task for _, task in tasks))
        for (channel, _), result in zip(tasks, results):
            if channel == "whatsapp":
                whatsapp_result = result
            else:
                email_result = result

    return whatsapp_result, email_result


@router.post("/scan-card", tags=["OCR"], summary="Scan a business card image")
async def scan_card(
    card: UploadFile = File(..., description="Business card image (JPG, JPEG, or PNG)"),
    connection_mode: str = Form("online"),
):
    # 1. Validate file type
    if not validate_file(card):
        raise HTTPException(status_code=400, detail="Invalid file type. Supported types: JPG, JPEG, PNG.")
    
    temp_path = None
    try:
        # 2. Save file safely to a temporary location
        temp_path = await save_temp_file(card)
        logger.info(f"Processing uploaded file: {card.filename}")
        
        # 3. Process image and run OCR
        raw_text = process_card_image(temp_path, card.filename)
        
        # 4. Extract structured contact data
        structured_data = parse_business_card(raw_text)
        ocr_warning = None
        if not raw_text.strip():
            import shutil

            if shutil.which("tesseract") is None:
                ocr_warning = (
                    "Server OCR is unavailable (Tesseract not installed on this host). "
                    "The website will try browser OCR automatically, or enter details manually."
                )
            else:
                ocr_warning = (
                    "OCR returned no text from this image. Try a clearer photo, "
                    "or enter contact details manually below."
                )

        whatsapp_result, email_result = await _schedule_outreach_for_contact(
            structured_data,
            online_mode=_is_online_mode(connection_mode),
        )
        
        # 5. Return structured response
        return {
            "success": True,
            "raw_text": raw_text,
            "contact": structured_data,
            "ocr_warning": ocr_warning,
            **_whatsapp_response(whatsapp_result),
            **_email_response(email_result),
        }
    except Exception as e:
        logger.error(f"Error processing file {card.filename}: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        # 5. Ensure temporary file cleanup
        if temp_path:
            cleanup_temp_file(temp_path)

class WhatsAppMessageRequest(BaseModel):
    contact_phone: str
    message: str

class WhatsAppTestRequest(BaseModel):
    contact_phone: str
    message: str = "hai"
    mode: str = "auto"

@router.post("/integrations/whatsapp/queue", tags=["Integrations"])
async def queue_whatsapp_message(request: WhatsAppMessageRequest):
    await whatsapp_queue.enqueue_message(request.contact_phone, request.message)
    return {"success": True, "message": "Message enqueued successfully"}

@router.post("/integrations/whatsapp/test", tags=["Integrations"])
async def test_whatsapp_message(request: WhatsAppTestRequest):
    import asyncio

    from services.whatsapp_service import (
        is_whatsapp_configured,
        send_business_card_template,
        send_whatsapp_message,
        send_whatsapp_template,
        send_whatsapp_text,
    )

    if not is_whatsapp_configured():
        raise HTTPException(
            status_code=503,
            detail="WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.",
        )

    try:
        if request.mode == "text":
            result = await asyncio.to_thread(send_whatsapp_text, request.contact_phone, request.message)
        elif request.mode == "template":
            result = await asyncio.to_thread(send_whatsapp_template, request.contact_phone)
        elif request.mode == "business-card":
            result = await asyncio.to_thread(
                send_business_card_template,
                request.contact_phone,
                "Contact",
            )
        else:
            result = await asyncio.to_thread(send_whatsapp_message, request.contact_phone, request.message)
    except Exception as exc:
        logger.error("WhatsApp test send failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    message_id = (result.get("messages") or [{}])[0].get("id")
    return {"success": True, "message_id": message_id, "response": result}

class EmailMessageRequest(BaseModel):
    contact_email: str
    message: str

@router.post("/integrations/email/queue", tags=["Integrations"])
async def queue_email_message(request: EmailMessageRequest):
    await email_queue.enqueue_message(request.contact_email, request.message)
    return {"success": True, "message": "Message enqueued successfully"}


class EmailTestRequest(BaseModel):
    contact_email: str
    test_override: str = "saligantisandeepzzz6@gmail.com"


@router.post("/integrations/email/test", tags=["Integrations"])
async def test_email_message(request: EmailTestRequest):
    import asyncio

    from services.email_service import is_gmail_configured, send_business_thank_you_email

    if not is_gmail_configured():
        raise HTTPException(
            status_code=503,
            detail="Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.",
        )

    try:
        result = await asyncio.to_thread(
            send_business_thank_you_email,
            request.contact_email,
            test_override=request.test_override or None,
        )
    except Exception as exc:
        logger.error("Email test send failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error") or "Email send failed.")

    return {"success": True, "result": result}

class DuplicateCheckRequest(BaseModel):
    fullName: str = ""
    company: str = ""
    phone: str = ""
    email: str = ""


@router.post("/contacts/check-duplicates")
async def check_duplicates(request: DuplicateCheckRequest):
    duplicates = find_duplicate_contacts(request.model_dump())
    return {"duplicates": duplicates}


class ContactUpdateRequest(BaseModel):
    contact: dict


@router.put("/contacts/{contact_id}")
async def update_existing_contact(contact_id: str, request: ContactUpdateRequest):
    result = update_contact(contact_id, request.contact)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Contact not found"))
    return result


@router.post("/contacts")
async def create_contact(
    contact: str = Form(...),
    card: Optional[UploadFile] = File(None),
):
    try:
        contact_data = json.loads(contact)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid contact JSON") from exc

    temp_path = None
    try:
        if card and card.filename:
            if not validate_file(card):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid card image. Supported types: JPG, JPEG, PNG.",
                )
            temp_path = await save_temp_file(card)
        try:
            result = save_contact(contact_data, image_path=temp_path)
        except LocalDbError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        if not result.get("success"):
            raise HTTPException(status_code=500, detail="Failed to save contact")
        online_mode = _is_online_mode(contact_data.get("connectionMode"))
        whatsapp_result, email_result = await _schedule_outreach_for_contact(
            contact_data,
            online_mode=online_mode,
            contact_id=result.get("id"),
            skip_whatsapp=bool(contact_data.get("skipWhatsApp")),
            skip_email=bool(contact_data.get("skipEmail")),
        )
        return {
            **result,
            **_whatsapp_response(whatsapp_result),
            **_email_response(email_result),
        }
    finally:
        if temp_path:
            cleanup_temp_file(temp_path)

@router.get("/contacts", tags=["Contacts"], summary="List all local database contacts")
async def fetch_contacts():
    return get_all_contacts()


class LocalContactBody(BaseModel):
    fullName: str
    firstName: str = ""
    lastName: str = ""
    designation: str = ""
    company: str = ""
    phone: str = ""
    secondaryPhone: str = ""
    email: str = ""
    secondaryEmail: str = ""
    website: str = ""
    secondaryWebsite: str = ""
    address: str = ""
    secondaryAddress: str = ""
    socialLinks: str = ""
    gstNumber: str = ""
    notes: str = ""
    cardImageBase64: str | None = None
    syncStatus: str = "local_only"
    zohoLeadId: str | None = None
    connectionMode: str = "online"
    skipWhatsApp: bool = False
    skipEmail: bool = False


class SyncStatusBody(BaseModel):
    syncStatus: str
    zohoLeadId: str | None = None


@router.get("/api/storage/config", tags=["Contacts"])
async def storage_config():
    from utils.storage_config import get_contact_storage_mode

    return {
        "storage": get_contact_storage_mode(),
        "database": storage.check_storage(),
    }


@router.get("/api/contacts", tags=["Contacts"], summary="List contacts (UI shape)")
async def list_contacts_api():
    return storage.list_contacts()


@router.get("/api/contacts/{contact_id}", tags=["Contacts"])
async def get_contact_api(contact_id: str):
    contact = storage.get_contact(contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.post("/api/contacts", tags=["Contacts"], summary="Save contact")
async def create_contact_json(body: LocalContactBody):
    try:
        payload = body.model_dump()
        result = storage.create_contact(payload)
        whatsapp_result, email_result = await _schedule_outreach_for_contact(
            payload,
            online_mode=_is_online_mode(body.connectionMode),
            contact_id=result["id"],
            skip_whatsapp=body.skipWhatsApp,
            skip_email=body.skipEmail,
        )
        if _is_online_mode(body.connectionMode):
            if body.skipWhatsApp:
                storage.mark_whatsapp_sent(result["id"])
            if body.skipEmail:
                storage.mark_email_sent(result["id"])
        return {
            "success": True,
            "id": result["id"],
            "contact": storage.get_contact(result["id"]),
            **_whatsapp_response(whatsapp_result),
            **_email_response(email_result),
        }
    except ContactStorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except LocalDbError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.put("/api/contacts/{contact_id}", tags=["Contacts"])
async def update_contact_json(contact_id: str, body: LocalContactBody):
    try:
        result = storage.update_contact(contact_id, body.model_dump())
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error", "Contact not found"))
        return {"success": True, "id": contact_id, "contact": storage.get_contact(contact_id)}
    except ContactStorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except LocalDbError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.patch("/api/contacts/{contact_id}/sync-status", tags=["Contacts"])
async def patch_contact_sync_status(contact_id: str, body: SyncStatusBody):
    storage.patch_sync_status(
        contact_id,
        sync_status=body.syncStatus,
        zoho_lead_id=body.zohoLeadId,
    )
    contact = storage.get_contact(contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"success": True, "contact": contact}


@router.delete("/api/contacts/{contact_id}", tags=["Contacts"])
async def delete_contact_api(contact_id: str, deleteZoho: bool = False):
    contact = storage.get_contact(contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if deleteZoho and contact.get("zohoLeadId"):
        zoho_lead_id = str(contact.get("zohoLeadId"))
        try:
            delete_lead(zoho_lead_id)
        except ZohoError as exc:
            if exc.status_code == 404:
                logger.warning("Zoho lead %s already deleted when deleting local contact.", zoho_lead_id)
            else:
                raise HTTPException(
                    status_code=exc.status_code,
                    detail=format_zoho_error_message(exc),
                ) from exc

    result = storage.delete_contact(contact_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message", "Contact not found"))
    return result

@router.post("/contacts/seed-sample")
async def seed_offline_sample():
    return seed_offline_sample_if_empty()

@router.post("/contacts/sync-pending-to-zoho")
async def sync_pending_contacts_to_zoho():
    try:
        result = sync_all_pending_to_zoho()
        for item in result.get("results", []):
            contact_id = item.get("id")
            if not item.get("success") or not contact_id:
                continue
            contact = storage.get_contact(contact_id)
            if not contact:
                continue
            whatsapp_result, email_result = await _schedule_outreach_for_contact(
                contact,
                on_zoho_sync=True,
                contact_id=contact_id,
            )
            item.update(_whatsapp_response(whatsapp_result))
            item.update(_email_response(email_result))
        return result
    except ZohoError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=format_zoho_error_message(exc)
        ) from exc
    except Exception as exc:
        logger.error("Bulk Zoho sync failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router.post("/contacts/{contact_id}/sync-to-zoho")
async def sync_single_contact_to_zoho(contact_id: str):
    try:
        result = sync_contact_to_zoho(contact_id)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error", "Contact not found"))
        contact = storage.get_contact(contact_id)
        if contact:
            whatsapp_result, email_result = await _schedule_outreach_for_contact(
                contact,
                on_zoho_sync=True,
                contact_id=contact_id,
            )
            result.update(_whatsapp_response(whatsapp_result))
            result.update(_email_response(email_result))
        return result
    except HTTPException:
        raise
    except ZohoError as exc:
        logger.warning("Zoho sync failed for %s: %s", contact_id, format_zoho_error_message(exc))
        raise HTTPException(
            status_code=exc.status_code, detail=format_zoho_error_message(exc)
        ) from exc
    except Exception as exc:
        logger.error("Zoho sync failed for %s: %s", contact_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router.delete("/contacts/{contact_id}")
async def remove_contact(contact_id: str):
    result = delete_contact(contact_id)
    return result


class WipeAllDataBody(BaseModel):
    confirm: bool = False
    include_zoho: bool = True


@router.post("/admin/wipe-all-data", tags=["Admin"])
async def wipe_all_data(body: WipeAllDataBody):
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail='Set confirm=true in the request body to wipe local database and related data.',
        )
    result = {
        "contacts": delete_all_contacts(),
        "storage": storage.storage_label(),
        "zoho": None,
    }
    if body.include_zoho:
        try:
            result["zoho"] = delete_all_leads()
        except ZohoError as exc:
            logger.warning("Zoho wipe skipped or partial: %s", exc)
            result["zoho"] = {"deleted": 0, "error": str(exc)}
    return {"success": True, **result}

