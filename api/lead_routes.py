import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import local_db_service as local_db
from services.local_db_service import LocalDbError
from services.zoho_service import (
    ZohoError,
    create_lead,
    delete_lead,
    format_zoho_error_message,
    get_leads,
)
from services.contact_service import _contact_to_zoho_payload, sync_payload_to_zoho

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leads", tags=["Leads"])


class CreateLeadRequest(BaseModel):
    fullName: str = Field(..., min_length=1)
    designation: Optional[str] = ""
    company: str = Field(..., min_length=1)
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""


class SyncFromLocalRequest(BaseModel):
    """Contact fields from IndexedDB / queue for Zoho sync + thank-you outreach."""
    fullName: Optional[str] = ""
    firstName: Optional[str] = ""
    lastName: Optional[str] = ""
    name: Optional[str] = ""
    company: Optional[str] = ""
    designation: Optional[str] = ""
    title: Optional[str] = ""
    phone: Optional[str] = ""
    secondaryPhone: Optional[str] = ""
    email: Optional[str] = ""
    secondaryEmail: Optional[str] = ""
    website: Optional[str] = ""
    address: Optional[str] = ""
    zohoLeadId: Optional[str] = None
    connectionMode: str = "online"
    skipWhatsApp: bool = False
    skipEmail: bool = False


@router.post("/sync-from-local")
async def sync_from_local_route(body: SyncFromLocalRequest):
    """Push a browser-stored contact to Zoho CRM, then send thank-you email/WhatsApp."""
    try:
        payload = body.model_dump(exclude_none=True)
        result = sync_payload_to_zoho(payload)
        if result.get("success") and result.get("zohoLeadId"):
            from api.routes import _payload_to_outreach_contact, fire_post_zoho_outreach

            fire_post_zoho_outreach(
                contact=_payload_to_outreach_contact(payload),
                skip_whatsapp=body.skipWhatsApp,
                skip_email=body.skipEmail,
            )
        return result
    except ZohoError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=format_zoho_error_message(exc)
        ) from exc
    except Exception as exc:
        logger.error("Local contact Zoho sync failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/create")
async def create_lead_route(body: CreateLeadRequest):
    zoho_lead = _contact_to_zoho_payload(body.model_dump())
    try:
        zoho_response = create_lead(zoho_lead)
        first = (zoho_response.get("data") or [{}])[0]
        return {
            "success": True,
            "message": "Lead created successfully in Zoho CRM.",
            "lead": {
                "id": (first.get("details") or {}).get("id"),
                "status": first.get("status", "unknown"),
                "code": first.get("code"),
            },
            "zoho": zoho_response,
        }
    except ZohoError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("")
async def list_leads_route():
    try:
        return get_leads()
    except ZohoError as exc:
        logger.warning("Zoho leads fetch failed (%s): %s", exc.status_code, exc)
        # Return empty list so the scan page can fall back to local DB gracefully
        return []


@router.delete("/{lead_id}")
async def delete_lead_route(lead_id: str):
    if not lead_id.strip():
        raise HTTPException(status_code=400, detail="Lead id is required.")
    try:
        zoho_response = delete_lead(lead_id.strip())
        try:
            local_db.delete_contact_by_zoho_lead_id(lead_id.strip())
        except LocalDbError as exc:
            logger.warning(
                "Zoho lead %s deleted but local DB cleanup failed: %s",
                lead_id.strip(),
                exc,
            )
        return {
            "success": True,
            "message": "Lead deleted successfully in Zoho CRM.",
            "zoho": zoho_response,
        }
    except ZohoError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
