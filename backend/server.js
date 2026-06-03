const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs/promises");
const swaggerUi = require("swagger-ui-express");
const env = require("./config/env");
const leadRoutes = require("./routes/leadRoutes");
const { refreshAccessToken } = require("./services/zohoService");
const { recognizeCardText } = require("./services/ocrService");
const HttpError = require("./utils/httpError");

const app = express();
const PORT = env.port;
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CardSync Backend API",
    version: "1.0.0",
    description: "OCR and Zoho CRM sync API for CardSync."
  },
  servers: [
    {
      url: SERVER_BASE_URL
    }
  ],
  tags: [
    { name: "Health" },
    { name: "Scan" },
    { name: "Leads" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check with Zoho connectivity",
        responses: {
          200: {
            description: "Backend healthy and Zoho token available"
          },
          503: {
            description: "Backend healthy but Zoho not reachable/configured"
          }
        }
      }
    },
    "/scan-card": {
      post: {
        tags: ["Scan"],
        summary: "Extract card data and create Zoho Lead",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["card"],
                properties: {
                  card: {
                    type: "string",
                    format: "binary",
                    description: "Business card image file"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "OCR and Zoho sync successful"
          },
          400: {
            description: "No card file provided"
          },
          500: {
            description: "OCR or Zoho sync failed"
          }
        }
      }
    },
    "/api/leads/create": {
      post: {
        tags: ["Leads"],
        summary: "Create Lead in Zoho CRM",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fullName", "company"],
                properties: {
                  fullName: { type: "string", example: "John Doe" },
                  designation: { type: "string", example: "Sales Manager" },
                  company: { type: "string", example: "Acme Corp" },
                  address: { type: "string", example: "MG Road, Bengaluru" },
                  phone: { type: "string", example: "+91 9876543210" },
                  email: { type: "string", example: "john@example.com" },
                  website: { type: "string", example: "www.acme.com" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Lead created successfully" },
          400: { description: "Validation failed" },
          500: { description: "Zoho/network/internal failure" }
        }
      }
    }
  }
};

app.use(cors());
app.use(express.json());
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
app.use("/api/leads", leadRoutes);

const upload = multer({
  dest: "uploads/"
});

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}/g;
const WEBSITE_REGEX = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?/gi;
const EMAIL_IN_LINE_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const WEBSITE_IN_LINE_REGEX = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?/i;

const cleanLine = (line) =>
  line
    .replace(/[|•<>]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9@.+,\-() ]+$/g, "")
    .trim();

const isLikelyName = (line) => {
  if (!line) return false;
  if (/@|www\.|https?:\/\//i.test(line)) return false;
  if (/\d/.test(line)) return false;
  if (line.split(" ").length < 2 || line.split(" ").length > 4) return false;
  const badWords = /(connect|create|elevate|digital marketing specialist|india|gujarat)/i;
  return !badWords.test(line);
};

const DESIGNATION_KEYWORDS = [
  // IT / Product / Design
  "ui",
  "ux",
  "ui ux",
  "ui/ux",
  "frontend",
  "front end",
  "backend",
  "back end",
  "full stack",
  "developer",
  "engineer",
  "software",
  "qa",
  "sdet",
  "devops",
  "cloud",
  "data",
  "analyst",
  "architect",
  "designer",
  "product",
  // Business / generic
  "manager",
  "director",
  "specialist",
  "consultant",
  "consulting",
  "founder",
  "ceo",
  "cto",
  "coo",
  "cfo",
  "marketing",
  "sales",
  "executive",
  "lead",
  "head",
  "officer",
  "associate",
  "coordinator",
  "business development",
  "hr"
];

const ADDRESS_KEYWORDS = [
  "road",
  "rd",
  "street",
  "st",
  "avenue",
  "ave",
  "lane",
  "ln",
  "floor",
  "tower",
  "plaza",
  "sector",
  "phase",
  "block",
  "nagar",
  "city",
  "district",
  "state",
  "india",
  "gujarat",
  "maharashtra",
  "karnataka",
  "haryana",
  "ahmedabad",
  "bengaluru",
  "bangalore",
  "mumbai",
  "delhi",
  "gurugram",
  "gurgaon",
  "pincode",
  "pin",
  "zip"
];

const hasKeyword = (line, keywords) => {
  const normalized = ` ${line.toLowerCase().replace(/[^a-z0-9/ ]/g, " ")} `;
  const compact = normalized.replace(/\s+/g, "");
  return keywords.some((keyword) => {
    const k = keyword.toLowerCase().trim();
    const kCompact = k.replace(/\s+/g, "");
    return normalized.includes(` ${k} `) || compact.includes(kCompact);
  });
};

const isLikelyDesignation = (line) => {
  if (!line) return false;
  if (/@|www\.|https?:\/\//i.test(line)) return false;
  if (line.replace(/\D/g, "").length >= 6) return false;
  if (isLikelyAddress(line)) return false;
  return hasKeyword(line, DESIGNATION_KEYWORDS);
};

const isLikelyCompany = (line) =>
  /(pvt|ltd|llp|inc|corp|technologies|tech|solutions|digital|systems|labs|group|media|studio|agency)/i.test(
    line
  );

const isLikelyAddress = (line) => {
  if (!line) return false;
  if (/@|www\.|https?:\/\//i.test(line)) return false;
  // Avoid treating raw phone-like lines as address.
  if (/\+?\d[\d\s-]{8,}/.test(line)) return false;
  const digits = line.replace(/\D/g, "").length;
  const hasAddressKeyword = hasKeyword(line, ADDRESS_KEYWORDS);
  const looksStructuredAddress = digits >= 4 && /,|sector|floor|plaza|block|road|street|city|india/i.test(line);
  return hasAddressKeyword || looksStructuredAddress;
};

const normalizePhone = (phoneRaw) => {
  if (!phoneRaw) return "";
  const cleaned = phoneRaw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return cleaned;
};

const normalizeWebsite = (rawWebsite) => {
  if (!rawWebsite) return "";
  let value = rawWebsite.trim().toLowerCase();
  value = value.replace(/[),.;]+$/g, "");
  value = value.replace(/^https?:\/\//, "");
  if (!value.startsWith("www.")) {
    value = `www.${value}`;
  }
  return value;
};

const toWordMeta = (word) => {
  const text = (word?.text || "").trim();
  if (!text) return null;

  const bbox = word?.bbox || {};
  const x0 = Number.isFinite(bbox.x0) ? bbox.x0 : Number.isFinite(bbox.x) ? bbox.x : 0;
  const y0 = Number.isFinite(bbox.y0) ? bbox.y0 : Number.isFinite(bbox.y) ? bbox.y : 0;
  const x1 = Number.isFinite(bbox.x1) ? bbox.x1 : x0 + (Number.isFinite(bbox.w) ? bbox.w : 0);
  const y1 = Number.isFinite(bbox.y1) ? bbox.y1 : y0 + (Number.isFinite(bbox.h) ? bbox.h : 0);
  const h = Math.max(1, y1 - y0);
  const w = Math.max(1, x1 - x0);

  return {
    text,
    x: x0,
    y: y0,
    x2: x1,
    y2: y1,
    w,
    h,
    cx: x0 + w / 2,
    cy: y0 + h / 2
  };
};

const buildLayoutLines = (words = []) => {
  const metas = words.map(toWordMeta).filter(Boolean).sort((a, b) => {
    if (Math.abs(a.cy - b.cy) < 8) return a.x - b.x;
    return a.cy - b.cy;
  });

  if (!metas.length) return [];

  const avgHeight = metas.reduce((sum, w) => sum + w.h, 0) / metas.length;
  const yThreshold = Math.max(10, avgHeight * 0.7);
  const rows = [];

  for (const meta of metas) {
    let row = rows.find((r) => Math.abs(r.cy - meta.cy) <= yThreshold);
    if (!row) {
      row = { words: [], cy: meta.cy };
      rows.push(row);
    }
    row.words.push(meta);
    row.cy = row.words.reduce((sum, w) => sum + w.cy, 0) / row.words.length;
  }

  return rows
    .map((row) => {
      const ws = row.words.sort((a, b) => a.x - b.x);
      const text = cleanLine(ws.map((w) => w.text).join(" "));
      if (!text) return null;
      const x = Math.min(...ws.map((w) => w.x));
      const x2 = Math.max(...ws.map((w) => w.x2));
      const y = Math.min(...ws.map((w) => w.y));
      const y2 = Math.max(...ws.map((w) => w.y2));
      return {
        text,
        x,
        x2,
        y,
        y2,
        h: y2 - y
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
};

const toCompanyFromEmailDomain = (email) => {
  const domain = email.split("@")[1] || "";
  const root = domain.replace(/^www\./i, "").split(".")[0] || "";
  if (!root) return "";
  return root
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const parseContactFromOcr = (text, words = []) => {
  const emails = [...new Set(text.match(EMAIL_REGEX) || [])];
  const email = emails[0] || "";

  const rawPhones = text.match(PHONE_REGEX) || [];
  const phones = [
    ...new Set(
      rawPhones
        .filter((p) => p.replace(/\D/g, "").length >= 10)
        .map((p) => normalizePhone(p))
        .filter(Boolean)
    )
  ];
  const phone = phones[0] || "";

  const websiteMatches = Array.from(text.matchAll(WEBSITE_REGEX));
  const websites = websiteMatches
    .filter((match) => {
      const value = match[0] || "";
      const idx = match.index || 0;
      const nextChar = text[idx + value.length] || "";
      // Skip domain-like parts that are immediately followed by '@' (email local/domain fragments).
      return nextChar !== "@";
    })
    .map((match) => match[0]);
  let website = normalizeWebsite(websites[0] || "");

  const layoutLines = buildLayoutLines(words);
  const fallbackLines = text
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .map((line, idx) => ({ text: line, x: idx < 4 ? 0 : 1000, y: idx * 16, h: 16 }));
  const lines = layoutLines.length ? layoutLines : fallbackLines;

  const splitX =
    lines.length > 2
      ? lines.slice().sort((a, b) => a.x - b.x)[Math.floor(lines.length / 2)].x
      : 380;
  const leftLines = lines.filter((l) => l.x <= splitX);
  const rightLines = lines.filter((l) => l.x > splitX);

  const rightJoined = rightLines.map((l) => l.text).join("\n");
  const rightEmail = (rightJoined.match(EMAIL_REGEX) || [])[0] || email;
  const rightPhone = normalizePhone(
    (rightJoined.match(PHONE_REGEX) || []).find((p) => p.replace(/\D/g, "").length >= 10) || phone
  );

  const websiteFromRight =
    rightLines
      .map((l) => l.text.replace(/\s/g, ""))
      .map((l) => l.match(/(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?/i))
      .find(Boolean)?.[0] || website;
  website = normalizeWebsite(websiteFromRight);

  const usableLeft = leftLines
    .map((l) => ({ ...l, text: cleanLine(l.text) }))
    .filter((l) => l.text)
    .filter((l) => !EMAIL_IN_LINE_REGEX.test(l.text))
    .filter((l) => !WEBSITE_IN_LINE_REGEX.test(l.text))
    .filter((l) => !/\+\d/.test(l.text))
    .filter((l) => !/(strategy|growth|impact|connect|create|elevate)/i.test(l.text));

  let name =
    usableLeft
      .filter((l) => isLikelyName(l.text))
      .sort((a, b) => b.h - a.h)[0]?.text || "";
  let designation =
    usableLeft.find((l) => isLikelyDesignation(l.text))?.text || "";
  let company =
    usableLeft.find((l) => isLikelyCompany(l.text))?.text || "";

  const addressStartIndex = rightLines.findIndex((l) => isLikelyAddress(l.text));
  let address = "";
  if (addressStartIndex >= 0) {
    address = rightLines
      .slice(addressStartIndex, Math.min(addressStartIndex + 3, rightLines.length))
      .map((l) => cleanLine(l.text))
      .join(", ");
  }

  if (!name && usableLeft.length) {
    name = usableLeft.sort((a, b) => b.h - a.h)[0].text;
  }

  if (!designation && usableLeft.length > 1) {
    const fallback = usableLeft.find(
      (line) => line.text !== name && line.text.length > 3 && isLikelyDesignation(line.text)
    );
    designation = fallback?.text || "";
  }

  if (!company) {
    const fallback = usableLeft.find(
      (line) => line.text !== name && line.text !== designation && line.y < (usableLeft.find((l) => l.text === name)?.y || 999)
    );
    company = fallback?.text || "";
  }

  if (!company) {
    const fallback = usableLeft.find(
      (line) => line.text !== name && line.text !== designation && !isLikelyAddress(line.text)
    );
    company = fallback?.text || toCompanyFromEmailDomain(rightEmail);
  }

  if (!address) {
    const fallback = rightLines.find(
      (line) =>
        line.text !== rightEmail &&
        !WEBSITE_IN_LINE_REGEX.test(line.text) &&
        isLikelyAddress(line.text)
    );
    address = fallback?.text || "";
  }

  if (!designation && usableLeft.length > 1) {
    const fallback = usableLeft.find(
      (line) => line.text !== name && line.text.length > 3 && isLikelyDesignation(line.text)
    );
    designation = fallback?.text || "";
  }

  // fallback with text lines if still empty
  if (!name || !designation || !company) {
    const flatLines = text
      .split("\n")
      .map(cleanLine)
      .filter(Boolean)
      .filter((line) => !EMAIL_IN_LINE_REGEX.test(line))
      .filter((line) => !WEBSITE_IN_LINE_REGEX.test(line));
    if (!name) name = flatLines.find(isLikelyName) || name;
    if (!designation) designation = flatLines.find(isLikelyDesignation) || designation;
    if (!company) company = flatLines.find(isLikelyCompany) || company;
    if (!address) {
      const addressLines = flatLines.filter(isLikelyAddress).slice(0, 2);
      address = addressLines.join(", ");
    }
  }

  const emailToUse = rightEmail || email;
  const phoneToUse = rightPhone || phone;

  // Final cleanup to prevent obvious OCR pollution in wrong fields
  company = company.includes("@") ? toCompanyFromEmailDomain(emailToUse) : company;
  name = (name || "").replace(/\+?\d[\d\s-]{7,}/g, "").trim();
  designation = cleanLine((designation || "").replace(/[,@]/g, " "));

  if (!website && emailToUse.includes("@")) {
    const domain = (emailToUse.split("@")[1] || "").toLowerCase().trim();
    website = normalizeWebsite(domain);
  }
  if (emailToUse.includes("@")) {
    const localPart = (emailToUse.split("@")[0] || "").toLowerCase();
    const emailDomain = (emailToUse.split("@")[1] || "").toLowerCase();
    const hasKnownTld = /\.(com|in|org|net|co|io|ai|tech|biz|info|me|edu|gov)$/i.test(website);
    if (!website || website.includes(localPart) || !hasKnownTld) {
      website = normalizeWebsite(emailDomain);
    }
  }

  if (!address && rightLines.length) {
    address = rightLines[rightLines.length - 1].text;
  }

  if (designation && isLikelyAddress(designation) && !isLikelyAddress(address)) {
    address = designation;
    designation = "";
  }

  if (!designation && usableLeft.length) {
    const fallback = usableLeft.find(
      (line) =>
        line.text !== name &&
        line.text !== company &&
        line.text.length > 4 &&
        isLikelyDesignation(line.text)
    );
    designation = fallback?.text || "";
  }

  // Raw-text fallback for designation/address when layout grouping misses lines.
  const rawLines = text
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .filter((line) => !EMAIL_IN_LINE_REGEX.test(line))
    .filter((line) => !WEBSITE_IN_LINE_REGEX.test(line))
    .filter((line) => !/\+\d[\d\s-]{7,}/.test(line));

  if (!designation) {
    const rawDesignation = rawLines.find(
      (line) =>
        !isLikelyAddress(line) &&
        line.length >= 6 &&
        line.length <= 48 &&
        isLikelyDesignation(line)
    );
    designation = rawDesignation || "";
  }

  if (!address) {
    const addressStart = rawLines.findIndex((line) => isLikelyAddress(line));
    if (addressStart >= 0) {
      address = rawLines
        .slice(addressStart, Math.min(addressStart + 3, rawLines.length))
        .filter((line) => !/\+?\d[\d\s-]{8,}/.test(line))
        .filter((line) => !isLikelyDesignation(line))
        .filter((line) => !isLikelyDesignation(line))
        .join(", ");
    }
  }

  // Enforce strict field validity: don't force unrelated text into designation/address.
  if (designation && !isLikelyDesignation(designation)) {
    designation = "";
  }
  if (address && !isLikelyAddress(address)) {
    address = "";
  }

  return {
    name: name || "",
    designation: designation || "",
    company: company || "",
    address: address || "",
    email: emailToUse,
    phone: phoneToUse,
    emails,
    phones,
    website
  };
};

app.get("/health", async (_req, res) => {
  try {
    const tokenData = await refreshAccessToken();
    res.json({
      ok: true,
      service: "cardsync-backend",
      zoho: {
        connected: Boolean(tokenData?.access_token)
      }
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: "cardsync-backend",
      zoho: {
        connected: false
      },
      error: error.message
    });
  }
});

app.post(
  "/scan-card",
  upload.single("card"),
  async (req, res) => {
    let uploadPath;

    try {
      if (!req.file?.path) {
        return res.status(400).json({
          success: false,
          error: "No card image uploaded. Use multipart/form-data with field name 'card'."
        });
      }
      uploadPath = req.file.path;

      // OCR READ IMAGE (Google Vision preferred; Tesseract fallback)
      const ocrResult = await recognizeCardText(uploadPath);
      const text = ocrResult.text;

      console.log(text);

      // EXTRACT DATA
      const {
        name,
        email,
        phone,
        emails,
        phones,
        website,
        designation,
        company,
        address
      } = parseContactFromOcr(text, ocrResult.words || []);

      // PRINT EXTRACTED DATA

      console.log({
        name,
        email,
        phone,
        designation,
        company,
        address
      });

      // FINAL RESPONSE: OCR only. Zoho write happens from Review save endpoint.

      res.json({

        success: true,

        contact: {
          name,
          email,
          phone,
          emails: emails || [],
          phones: phones || [],
          website,
          designation,
          company,
          address
        }
      });

    } catch (error) {

      console.log(
        error.response?.data || error.message
      );

      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      res.status(statusCode).json({
        success: false,
        error:
          error.details || error.response?.data || error.message
      });
    } finally {
      if (uploadPath) {
        try {
          await fs.unlink(uploadPath);
        } catch {
          // Ignore cleanup failures; does not affect API result.
        }
      }
    }
  }
);

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.details || err.message || "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
