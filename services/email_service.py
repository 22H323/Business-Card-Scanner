import asyncio
import html
import logging
import os
import smtplib
import time
from email.message import EmailMessage
from typing import Any

from utils.parser_utils import is_valid_email

logger = logging.getLogger(__name__)

_RECENT_SENDS: dict[str, float] = {}
_SEND_DEDUPE_SECONDS = 120

MAIL_SERVER = "smtp.gmail.com"
MAIL_PORT = 587

SUBJECT = "Thank You for Your Interest"

# Brand palette (inline-safe hex values for email clients)
_BRAND_PRIMARY = "#0891b2"
_BRAND_PRIMARY_DARK = "#0e7490"
_BRAND_ACCENT = "#7c3aed"
_BRAND_TEXT = "#1e293b"
_BRAND_MUTED = "#64748b"
_BRAND_SURFACE = "#f8fafc"
_BRAND_BORDER = "#e2e8f0"


def _normalize_env(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().strip('"').strip("'")


GMAIL_USER = _normalize_env(os.getenv("GMAIL_USER"))


def _normalize_gmail_app_password(value: str | None) -> str:
    """Gmail App Passwords are 16 chars; remove spaces from .env (e.g. 'abcd efgh')."""
    return _normalize_env(value).replace(" ", "")


GMAIL_APP_PASSWORD = _normalize_gmail_app_password(os.getenv("GMAIL_APP_PASSWORD"))
BUSINESS_COMPANY_NAME = _normalize_env(os.getenv("BUSINESS_COMPANY_NAME")) or "CardSync"
BUSINESS_PHONE = _normalize_env(os.getenv("BUSINESS_PHONE")) or ""
BUSINESS_WEBSITE = _normalize_env(os.getenv("BUSINESS_WEBSITE")) or ""
BUSINESS_EMAIL = _normalize_env(os.getenv("BUSINESS_EMAIL")) or GMAIL_USER
EMAIL_TEST_RECIPIENT = _normalize_env(os.getenv("EMAIL_TEST_RECIPIENT"))


def _auto_send_enabled() -> bool:
    return _normalize_env(os.getenv("EMAIL_AUTO_SEND_ON_SCAN")).lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def is_gmail_configured() -> bool:
    return bool(GMAIL_USER and GMAIL_APP_PASSWORD)


def extract_primary_email(contact: dict[str, Any]) -> str:
    """Extract the primary email address from parsed contact data."""
    for key in ("email", "emailAddress", "primaryEmail"):
        value = str(contact.get(key) or "").strip()
        if value:
            return value

    for key in ("emails", "emailAddresses"):
        values = contact.get(key) or []
        if isinstance(values, list):
            for value in values:
                text = str(value or "").strip()
                if text:
                    return text
    return ""


def validate_email_address(email: str) -> tuple[bool, str]:
    """Validate that an email address is present and properly formatted."""
    normalized = str(email or "").strip()
    if not normalized:
        return False, "Email address is required."
    if not is_valid_email(normalized):
        return False, f"Invalid email format: '{normalized}'"
    return True, normalized


def extract_contact_name(contact: dict[str, Any]) -> str:
    """Extract display name from parsed contact data."""
    for key in ("fullName", "name"):
        value = str(contact.get(key) or "").strip()
        if value:
            return value

    first = str(contact.get("firstName") or "").strip()
    last = str(contact.get("lastName") or "").strip()
    combined = f"{first} {last}".strip()
    return combined


def _greeting_name(recipient_name: str | None) -> str:
    name = str(recipient_name or "").strip()
    if not name:
        return "Valued Customer"
    return name.split()[0] if name else "Valued Customer"


def build_thank_you_email_plain(recipient_name: str | None = None) -> str:
    """Build the plain-text fallback for the business thank-you email."""
    greeting = _greeting_name(recipient_name)
    contact_lines = [
        BUSINESS_COMPANY_NAME,
        "Business Development Team",
    ]
    if BUSINESS_PHONE:
        contact_lines.append(BUSINESS_PHONE)
    if BUSINESS_WEBSITE:
        contact_lines.append(BUSINESS_WEBSITE)
    if BUSINESS_EMAIL:
        contact_lines.append(BUSINESS_EMAIL)

    signature = "\n".join(contact_lines)
    return (
        f"Dear {greeting},\n\n"
        "Thank you for connecting with us.\n\n"
        "We appreciate your interest in our services and would be happy to assist you "
        "with any questions or requirements you may have.\n\n"
        "Our team is committed to providing professional support and delivering the "
        "best possible experience for our clients.\n\n"
        "Please feel free to reply to this email if you need additional information "
        "or would like to schedule a discussion.\n\n"
        "Best regards,\n\n"
        f"{signature}\n"
    )


def _contact_detail_rows() -> str:
    """Build footer contact rows for the HTML table template."""
    rows: list[str] = []
    details: list[tuple[str, str, str | None]] = []

    if BUSINESS_PHONE:
        details.append(("Phone", BUSINESS_PHONE, f"tel:{BUSINESS_PHONE.replace(' ', '')}"))
    if BUSINESS_WEBSITE:
        website = BUSINESS_WEBSITE if BUSINESS_WEBSITE.startswith("http") else f"https://{BUSINESS_WEBSITE}"
        details.append(("Website", BUSINESS_WEBSITE, website))
    if BUSINESS_EMAIL:
        details.append(("Email", BUSINESS_EMAIL, f"mailto:{BUSINESS_EMAIL}"))

    for label, value, href in details:
        safe_label = html.escape(label)
        safe_value = html.escape(value)
        if href:
            safe_href = html.escape(href, quote=True)
            cell = (
                f'<a href="{safe_href}" style="color:{_BRAND_PRIMARY};'
                f'text-decoration:none;font-weight:500;">{safe_value}</a>'
            )
        else:
            cell = safe_value
        rows.append(
            f'<tr>'
            f'<td style="padding:6px 0;color:{_BRAND_MUTED};font-size:13px;'
            f'width:72px;vertical-align:top;">{safe_label}</td>'
            f'<td style="padding:6px 0;color:{_BRAND_TEXT};font-size:13px;'
            f'vertical-align:top;">{cell}</td>'
            f"</tr>"
        )
    return "\n".join(rows)


def build_thank_you_email_html(recipient_name: str | None = None) -> str:
    """Build a table-based HTML email body compatible with major email clients."""
    greeting = html.escape(_greeting_name(recipient_name))
    company = html.escape(BUSINESS_COMPANY_NAME)
    reply_email = html.escape(BUSINESS_EMAIL or GMAIL_USER)
    reply_href = html.escape(f"mailto:{BUSINESS_EMAIL or GMAIL_USER}", quote=True)
    contact_rows = _contact_detail_rows()
    year = time.strftime("%Y")

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>{html.escape(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Thank you for connecting with {company}. We look forward to assisting you.
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Email container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,{_BRAND_PRIMARY},{_BRAND_ACCENT});background-color:{_BRAND_PRIMARY};border-radius:12px 12px 0 0;padding:28px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.85);font-weight:600;">
                      {company}
                    </p>
                    <h1 style="margin:0;font-size:26px;line-height:1.3;font-weight:700;color:#ffffff;">
                      Thank You for Your Interest
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid {_BRAND_BORDER};border-right:1px solid {_BRAND_BORDER};padding:36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">

                <tr>
                  <td style="padding-bottom:20px;font-size:16px;line-height:1.6;color:{_BRAND_TEXT};">
                    Dear <strong>{greeting}</strong>,
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom:16px;font-size:15px;line-height:1.7;color:{_BRAND_TEXT};">
                    Thank you for connecting with us. We appreciate your interest in our services
                    and would be happy to assist you with any questions or requirements you may have.
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom:24px;font-size:15px;line-height:1.7;color:{_BRAND_TEXT};">
                    Our team is committed to providing professional support and delivering the
                    best possible experience for our clients.
                  </td>
                </tr>

                <!-- Highlight box -->
                <tr>
                  <td style="padding-bottom:28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:{_BRAND_SURFACE};border:1px solid {_BRAND_BORDER};border-radius:8px;">
                      <tr>
                        <td style="padding:20px 24px;font-size:14px;line-height:1.6;color:{_BRAND_MUTED};">
                          Have questions or want to schedule a discussion? Simply reply to this email
                          and a member of our Business Development team will get back to you promptly.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA button -->
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td align="center" style="border-radius:8px;background-color:{_BRAND_PRIMARY};">
                          <a href="{reply_href}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:{_BRAND_PRIMARY};border:1px solid {_BRAND_PRIMARY_DARK};">
                            Reply to Our Team
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-bottom:4px;font-size:15px;line-height:1.6;color:{_BRAND_TEXT};">
                    Best regards,
                  </td>
                </tr>
                <tr>
                  <td style="font-size:15px;line-height:1.6;color:{_BRAND_TEXT};">
                    <strong>{company}</strong><br />
                    Business Development Team
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Contact footer -->
          <tr>
            <td style="background-color:{_BRAND_SURFACE};border:1px solid {_BRAND_BORDER};border-top:none;border-radius:0 0 12px 12px;padding:24px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                {contact_rows}
              </table>
            </td>
          </tr>

          <!-- Legal footer -->
          <tr>
            <td align="center" style="padding:24px 12px 8px;font-size:12px;line-height:1.5;color:{_BRAND_MUTED};">
              &copy; {year} {company}. All rights reserved.<br />
              You received this email because you connected with us at a business event or meeting.
            </td>
          </tr>

        </table>
        <!-- /Email container -->

      </td>
    </tr>
  </table>
</body>
</html>"""


def build_thank_you_email_body(recipient_name: str | None = None) -> tuple[str, str]:
    """Return (plain_text, html) bodies for the business thank-you email."""
    return (
        build_thank_you_email_plain(recipient_name),
        build_thank_you_email_html(recipient_name),
    )


def _attach_multipart_body(message: EmailMessage, plain: str, html_body: str) -> None:
    """Attach plain-text and HTML alternatives to an EmailMessage."""
    message.set_content(plain)
    message.add_alternative(html_body, subtype="html")


def _resolve_recipient(extracted_email: str, *, test_override: str | None = None) -> str:
    """Resolve the final recipient, applying test override when configured."""
    override = test_override or EMAIL_TEST_RECIPIENT
    if override:
        logger.info(
            "Email test override active: sending to %s instead of %s",
            override,
            extracted_email or "(none)",
        )
        return override
    return extracted_email


def send_business_thank_you_email(
    recipient_email: str,
    *,
    recipient_name: str | None = None,
    test_override: str | None = None,
) -> dict[str, Any]:
    """
    Validate, compose, and send the business thank-you email via Gmail SMTP.

    Returns a result dict with success, recipient, and error fields.
    """
    result: dict[str, Any] = {
        "success": False,
        "recipient_email": None,
        "extracted_email": recipient_email,
        "subject": SUBJECT,
        "error": None,
    }

    is_valid, validated_or_error = validate_email_address(recipient_email)
    if not is_valid:
        logger.warning("Email send aborted: %s", validated_or_error)
        result["error"] = validated_or_error
        return result

    validated_email: str = validated_or_error
    to_address = _resolve_recipient(validated_email, test_override=test_override)
    is_valid_to, to_validated_or_error = validate_email_address(to_address)
    if not is_valid_to:
        logger.warning("Email send aborted: %s", to_validated_or_error)
        result["error"] = to_validated_or_error
        return result

    to_address = to_validated_or_error
    result["recipient_email"] = to_address

    if not is_gmail_configured():
        error = "Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env."
        logger.error("Email send failed: %s", error)
        result["error"] = error
        return result

    plain_body, html_body = build_thank_you_email_body(recipient_name)
    message = EmailMessage()
    message["Subject"] = SUBJECT
    message["From"] = GMAIL_USER
    message["To"] = to_address
    message["Reply-To"] = BUSINESS_EMAIL or GMAIL_USER
    _attach_multipart_body(message, plain_body, html_body)

    logger.info(
        "Sending business thank-you email via Gmail SMTP -> to=%s from=%s subject=%r",
        to_address,
        GMAIL_USER,
        SUBJECT,
    )

    try:
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        error = (
            "Gmail SMTP authentication failed. Verify GMAIL_USER and GMAIL_APP_PASSWORD "
            "(use a Google App Password, not your account password)."
        )
        logger.error("Email send failed for %s: %s (%s)", to_address, error, exc, exc_info=True)
        result["error"] = error
        return result
    except smtplib.SMTPRecipientsRefused as exc:
        error = f"Gmail rejected recipient {to_address}: {exc.recipients}"
        logger.error("Email send failed: %s", error, exc_info=True)
        result["error"] = error
        return result
    except smtplib.SMTPException as exc:
        error = f"SMTP error while sending to {to_address}: {exc}"
        logger.error("Email send failed: %s", error, exc_info=True)
        result["error"] = error
        return result
    except OSError as exc:
        error = f"Network error connecting to Gmail SMTP: {exc}"
        logger.error("Email send failed: %s", error, exc_info=True)
        result["error"] = error
        return result
    except Exception as exc:
        error = f"Unexpected error sending email to {to_address}: {exc}"
        logger.error("Email send failed: %s", error, exc_info=True)
        result["error"] = error
        return result

    logger.info("SUCCESS: Business thank-you email sent to %s", to_address)
    result["success"] = True
    return result


def send_thank_you_to_contact(
    contact: dict[str, Any],
    *,
    test_override: str | None = None,
) -> dict[str, Any]:
    """Extract email from contact data and send the business thank-you email."""
    extracted = extract_primary_email(contact)
    if not extracted:
        raise ValueError("No primary email address found on the contact.")

    contact_name = extract_contact_name(contact)
    logger.info(
        "Email dynamic send -> extracted email=%s name=%s",
        extracted,
        contact_name or "unknown",
    )
    return send_business_thank_you_email(
        extracted,
        recipient_name=contact_name or None,
        test_override=test_override,
    )


def _should_send_to_email(email: str) -> bool:
    normalized = email.strip().lower()
    if not normalized:
        return False

    now = time.time()
    last_sent = _RECENT_SENDS.get(normalized, 0)
    if now - last_sent < _SEND_DEDUPE_SECONDS:
        logger.info("Skipping duplicate email send to %s within dedupe window.", normalized)
        return False

    _RECENT_SENDS[normalized] = now
    return True


async def schedule_email_for_contact(
    contact: dict[str, Any],
    *,
    online_mode: bool = True,
    on_zoho_sync: bool = False,
    contact_id: str | None = None,
    skip_if_already_sent: bool = True,
    test_override: str | None = None,
) -> dict[str, Any]:
    """
    Send a business thank-you email to the contact's primary email address.

    Returns a result dict with attempted/sent/error fields.
    """
    skipped: dict[str, Any] = {
        "attempted": False,
        "sent": False,
        "queued": False,
        "error": None,
        "recipient_email": None,
        "extracted_email": None,
        "subject": SUBJECT,
    }

    if not _auto_send_enabled():
        logger.debug("Email auto-send disabled via EMAIL_AUTO_SEND_ON_SCAN.")
        skipped["error"] = "Email auto-send is disabled."
        return skipped

    if not on_zoho_sync and not online_mode:
        logger.info("Email auto-send skipped: offline mode (will send on Zoho sync).")
        skipped["error"] = "Offline mode — email will send when you sync to Zoho."
        return skipped

    if not is_gmail_configured():
        logger.warning("Email auto-send skipped: missing GMAIL_USER or GMAIL_APP_PASSWORD.")
        skipped["error"] = "Gmail SMTP is not configured in .env."
        return skipped

    if contact_id and skip_if_already_sent:
        from services import contact_storage as storage

        existing = storage.get_contact(contact_id)
        if existing and storage.has_email_sent(existing):
            logger.info("Email auto-send skipped: already sent for contact %s.", contact_id)
            skipped["error"] = "Thank-you email was already sent for this contact."
            return skipped

    extracted = extract_primary_email(contact)
    skipped["extracted_email"] = extracted or None
    if not extracted:
        logger.info("Email auto-send skipped: no primary email on scanned contact.")
        skipped["error"] = "No primary email address found on the contact."
        return skipped

    is_valid, validated_or_error = validate_email_address(extracted)
    if not is_valid:
        logger.info("Email auto-send skipped: %s", validated_or_error)
        skipped["error"] = validated_or_error
        return skipped

    contact_name = extract_contact_name(contact)
    recipient = _resolve_recipient(validated_or_error, test_override=test_override)
    skipped["recipient_email"] = recipient
    logger.info(
        "Email dynamic send -> extracted email=%s name=%s",
        extracted,
        contact_name or "unknown",
    )

    if not _should_send_to_email(recipient):
        skipped["error"] = "Duplicate email send skipped for this address."
        return skipped

    try:
        delivery = await asyncio.to_thread(
            send_business_thank_you_email,
            extracted,
            recipient_name=contact_name or None,
            test_override=test_override,
        )
        if delivery["success"]:
            logger.info(
                "Business thank-you email sent to %s (extracted=%s)",
                delivery["recipient_email"],
                extracted,
            )
            if contact_id:
                from services import contact_storage as storage

                await asyncio.to_thread(storage.mark_email_sent, contact_id)
            return {
                "attempted": True,
                "sent": True,
                "queued": False,
                "error": None,
                "recipient_email": delivery["recipient_email"],
                "extracted_email": extracted,
                "subject": SUBJECT,
            }

        error_message = delivery.get("error") or "Unknown email send failure."
        logger.error("Email auto-send failed for %s: %s", extracted, error_message)
        return {
            "attempted": True,
            "sent": False,
            "queued": False,
            "error": error_message,
            "recipient_email": recipient,
            "extracted_email": extracted,
            "subject": SUBJECT,
        }
    except Exception as exc:
        error_message = str(exc)
        logger.error("Email auto-send failed for %s: %s", extracted, error_message, exc_info=True)
        return {
            "attempted": True,
            "sent": False,
            "queued": False,
            "error": error_message,
            "recipient_email": recipient,
            "extracted_email": extracted,
            "subject": SUBJECT,
        }


class EmailQueue:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.worker_task = None
        self.is_running = False

    async def start(self):
        """Starts the background worker processing the queue."""
        if not self.is_running:
            self.is_running = True
            self.worker_task = asyncio.create_task(self._worker())
            logger.info("Email background worker started.")

    async def stop(self):
        """Stops the background worker gracefully."""
        self.is_running = False
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            logger.info("Email background worker stopped.")

    async def enqueue_message(self, email: str, message: str | None = None):
        """Adds a message to the queue to be sent asynchronously."""
        item = {"email": email, "message": message}
        await self.queue.put(item)
        logger.info("Email enqueued for %s. Queue size: %s", email, self.queue.qsize())

    async def enqueue_thank_you(self, email: str):
        """Enqueue the standard business thank-you email."""
        await self.enqueue_message(email, message=None)

    async def _worker(self):
        """Background worker that continuously processes the queue."""
        while self.is_running:
            try:
                item = await self.queue.get()
                email = item["email"]
                custom_message = item.get("message")

                logger.info("Processing email message to %s...", email)

                if custom_message:
                    result = await asyncio.to_thread(
                        _send_custom_email,
                        email,
                        custom_message,
                    )
                else:
                    result = await asyncio.to_thread(send_business_thank_you_email, email)

                if result["success"]:
                    logger.info("SUCCESS: Email message sent to %s", result["recipient_email"])
                else:
                    logger.error(
                        "FAILED: Email message to %s — %s",
                        email,
                        result.get("error"),
                    )

                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Error processing email message: %s", exc, exc_info=True)
                self.queue.task_done()


def _send_custom_email(recipient_email: str, body: str, *, subject: str = SUBJECT) -> dict[str, Any]:
    """Send a custom plain-text email via Gmail SMTP."""
    result: dict[str, Any] = {
        "success": False,
        "recipient_email": None,
        "extracted_email": recipient_email,
        "subject": subject,
        "error": None,
    }

    is_valid, validated_or_error = validate_email_address(recipient_email)
    if not is_valid:
        result["error"] = validated_or_error
        return result

    to_address = validated_or_error
    result["recipient_email"] = to_address

    if not is_gmail_configured():
        result["error"] = "Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env."
        return result

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = GMAIL_USER
    message["To"] = to_address
    message["Reply-To"] = BUSINESS_EMAIL or GMAIL_USER
    message.set_content(body)

    try:
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:
        result["error"] = str(exc)
        logger.error("Custom email send failed for %s: %s", to_address, exc, exc_info=True)
        return result

    result["success"] = True
    return result


email_queue = EmailQueue()
