import requests
import os
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("ZOHO_CLIENT_ID")
CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN")

def get_access_token():

```
url = "https://accounts.zoho.in/oauth/v2/token"

params = {
    "refresh_token": REFRESH_TOKEN,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "grant_type": "refresh_token"
}

response = requests.post(url, params=params)

data = response.json()

return data["access_token"]
```

def create_lead(contact):

```
access_token = get_access_token()

url = "https://www.zohoapis.in/crm/v2/Leads"

headers = {
    "Authorization": f"Zoho-oauthtoken {access_token}"
}

payload = {
    "data": [
        {
            "Last_Name": contact["name"],
            "Company": contact["company"],
            "Email": contact["email"],
            "Phone": contact["phone"]
        }
    ]
}

response = requests.post(
    url,
    json=payload,
    headers=headers
)

return response.json()
```
