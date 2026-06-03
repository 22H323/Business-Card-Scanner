print("STARTED")

from services.zoho_service import create_lead

print("IMPORT SUCCESS")

contact = {
"name": "John Doe",
"company": "ABC Technologies",
"email": "[john@gmail.com](mailto:john@gmail.com)",
"phone": "9876543210"
}

print("CONTACT CREATED")

result = create_lead(contact)

print("API RESPONSE:")
print(result)
