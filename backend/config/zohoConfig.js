const env = require("./env");

module.exports = {
  accountsUrl: env.zohoAccountsUrl,
  apiDomain: env.zohoApiDomain,
  clientId: env.zohoClientId,
  clientSecret: env.zohoClientSecret,
  refreshToken: env.zohoRefreshToken,
  redirectUri: env.zohoRedirectUri,
  fallbackAccessToken: env.zohoAccessTokenFallback
};
