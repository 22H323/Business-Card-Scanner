const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { createLead, getLeads, deleteLead } = require("../services/zohoService");

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

const createLeadController = asyncHandler(async (req, res) => {
  const {
    fullName,
    designation,
    company,
    address,
    phone,
    email,
    website
  } = req.body || {};

  const safeFullName = normalizeString(fullName);
  const safeCompany = normalizeString(company);

  if (!safeFullName) {
    throw new HttpError(400, "fullName is required.");
  }

  if (!safeCompany) {
    throw new HttpError(400, "company is required.");
  }

  const zohoLead = {
    Last_Name: safeFullName,
    Company: safeCompany,
    Designation: normalizeString(designation),
    Street: normalizeString(address),
    Phone: normalizeString(phone),
    Email: normalizeString(email),
    Website: normalizeString(website)
  };

  const zohoResponse = await createLead(zohoLead);
  const firstResult = zohoResponse.data?.data?.[0] || {};

  return res.status(201).json({
    success: true,
    message: "Lead created successfully in Zoho CRM.",
    lead: {
      id: firstResult.details?.id || null,
      status: firstResult.status || "unknown",
      code: firstResult.code || null
    },
    zoho: zohoResponse.data
  });
});

const listLeadsController = asyncHandler(async (_req, res) => {
  const zohoResponse = await getLeads();
  const leads = (zohoResponse.data?.data || []).map((lead) => ({
    id: lead.id,
    name: lead.Last_Name || "",
    designation: lead.Designation || "",
    title: lead.Designation || "",
    company: lead.Company || "",
    address: lead.Street || "",
    phone: lead.Phone || "",
    email: lead.Email || "",
    website: lead.Website || "",
    status: "synced",
    lastSync: lead.Modified_Time || lead.Created_Time || "Just now",
    channels: {
      whatsapp: Boolean(lead.Phone),
      email: Boolean(lead.Email)
    }
  }));

  return res.status(200).json(leads);
});

const deleteLeadController = asyncHandler(async (req, res) => {
  const leadId = normalizeString(req.params.id);
  if (!leadId) {
    throw new HttpError(400, "Lead id is required.");
  }
  const zohoResponse = await deleteLead(leadId);
  return res.status(200).json({
    success: true,
    message: "Lead deleted successfully in Zoho CRM.",
    zoho: zohoResponse.data
  });
});

module.exports = {
  createLeadController,
  listLeadsController,
  deleteLeadController
};
