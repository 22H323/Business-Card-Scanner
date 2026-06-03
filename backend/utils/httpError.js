class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode || 500;
    this.details = details;
  }
}

module.exports = HttpError;
