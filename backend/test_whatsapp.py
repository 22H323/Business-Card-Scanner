"""Send a WhatsApp test message to a phone number extracted from a card scan."""
from services.whatsapp_service import send_scan_thank_you_to_contact

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python test_whatsapp.py <phone> [full_name] [company]")
        raise SystemExit(1)

    phone = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "Contact"
    company = sys.argv[3] if len(sys.argv) > 3 else ""
    result = send_scan_thank_you_to_contact(
        {"phone": phone, "fullName": name, "company": company},
    )
    print(result)