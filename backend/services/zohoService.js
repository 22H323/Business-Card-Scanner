const axios = require("axios");
const zohoConfig = require("../config/zohoConfig");
const HttpError = require("../utils/httpError");

let tokenCache = {
  accessToken: "",
  expiresAtMs: 0
};

const hasRefreshCredentials = () =>
  Boolean(zohoConfig.clientId && zohoConfig.clientSecret && zohoConfig.refreshToken);

const refreshAccessToken = async () => {
  if (!hasRefreshCredentials()) {
    if (zohoConfig.fallbackAccessToken) {
      return {
        access_token: zohoConfig.fallbackAccessToken,
        expires_in: 3600
      };
    }

    throw new HttpError(
      500,
      "Zoho credentials are missing. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN."
    );
  }

  const tokenUrl = `${zohoConfig.accountsUrl}/oauth/v2/token`;
  try {
    const response = await axios.post(tokenUrl, null, {
      params: {
        refresh_token: zohoConfig.refreshToken,
        client_id: zohoConfig.clientId,
        client_secret: zohoConfig.clientSecret,
        grant_type: "refresh_token",
        redirect_uri: zohoConfig.redirectUri || undefined
      },
      timeout: 15000
    });

    const accessToken = response.data?.access_token;
    const expiresIn = Number(response.data?.expires_in || 3600);

    if (!accessToken) {
      throw new HttpError(502, "Zoho token refresh failed: access_token missing.");
    }

    tokenCache = {
      accessToken,
      // 30s early refresh buffer
      expiresAtMs: Date.now() + Math.max(60, expiresIn - 30) * 1000
    };

    return response.data;
  } catch (error) {
    const zohoError = error.response?.data;
    throw new HttpError(
      error.response?.status || 502,
      "Failed to refresh Zoho access token.",
      zohoError || error.message
    );
  }
};

const getValidAccessToken = async () => {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAtMs) {
    return tokenCache.accessToken;
  }
  const tokenData = await refreshAccessToken();
  return tokenData.access_token;
};

const createLead = async (leadPayload) => {
  const endpoint = `${zohoConfig.apiDomain}/crm/v2/Leads`;

  const sendCreate = async (accessToken) => {
    return axios.post(
      endpoint,
      { data: [leadPayload] },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );
  };

  try {
    const accessToken = await getValidAccessToken();
    return await sendCreate(accessToken);
  } catch (error) {
    const zohoCode = error.response?.data?.code;
    const isInvalidToken = zohoCode === "INVALID_TOKEN";

    if (isInvalidToken && hasRefreshCredentials()) {
      await refreshAccessToken();
      const retriedToken = await getValidAccessToken();
      return sendCreate(retriedToken);
    }

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      error.response?.status || 502,
      "Failed to create lead in Zoho.",
      error.response?.data || error.message
    );
  }
};

const getLeads = async () => {
  const endpoint = `${zohoConfig.apiDomain}/crm/v2/Leads`;
  try {
    const accessToken = await getValidAccessToken();
    return await axios.get(endpoint, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      },
      params: {
        fields: "id,Last_Name,Company,Designation,Email,Phone,Website,Street,Modified_Time,Created_Time"
      },
      timeout: 20000
    });
  } catch (error) {
    const zohoCode = error.response?.data?.code;
    if (zohoCode === "INVALID_TOKEN" && hasRefreshCredentials()) {
      await refreshAccessToken();
      const retriedToken = await getValidAccessToken();
      return axios.get(endpoint, {
        headers: {
          Authorization: `Zoho-oauthtoken ${retriedToken}`
        },
        params: {
          fields: "id,Last_Name,Company,Designation,Email,Phone,Website,Street,Modified_Time,Created_Time"
        },
        timeout: 20000
      });
    }
    throw new HttpError(
      error.response?.status || 502,
      "Failed to fetch leads from Zoho.",
      error.response?.data || error.message
    );
  }
};

const deleteLead = async (leadId) => {
  const endpoint = `${zohoConfig.apiDomain}/crm/v2/Leads/${encodeURIComponent(leadId)}`;
  try {
    const accessToken = await getValidAccessToken();
    return await axios.delete(endpoint, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      },
      timeout: 20000
    });
  } catch (error) {
    throw new HttpError(
      error.response?.status || 502,
      "Failed to delete lead in Zoho.",
      error.response?.data || error.message
    );
  }
};

module.exports = {
  createLead,
  refreshAccessToken,
  getLeads,
  deleteLead
};
