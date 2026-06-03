const dotenv = require("dotenv");

dotenv.config();

const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  zohoClientId: process.env.ZOHO_CLIENT_ID || "",
  zohoClientSecret: process.env.ZOHO_CLIENT_SECRET || "",
  zohoRefreshToken: process.env.ZOHO_REFRESH_TOKEN || "",
  zohoRedirectUri: process.env.ZOHO_REDIRECT_URI || "",
  zohoAccountsUrl: process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in",
  zohoApiDomain: process.env.ZOHO_API_DOMAIN || process.env.ZOHO_API_URL || "https://www.zohoapis.in",
  zohoAccessTokenFallback: process.env.ZOHO_ACCESS_TOKEN || ""
};

module.exports = env;
