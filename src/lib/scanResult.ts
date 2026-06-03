export type ScanContact = {
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  designation?: string;
  company?: string;
  companyName?: string;
  phone?: string;
  phoneNumber?: string;
  email?: string;
  emailAddress?: string;
  website?: string;
  address?: string;
  notes?: string;
  phones?: string[];
  mobileNumbers?: string[];
  telephoneNumbers?: string[];
  emails?: string[];
  websites?: string[];
  addresses?: string[];
  socialLinks?: string[];
  gstNumbers?: string[];
  confidence?: Record<string, number>;
};

export type ParsedScanResult = {
  fullName: string;
  firstName: string;
  lastName: string;
  designation: string;
  companyName: string;
  phoneNumber: string;
  secondaryPhoneNumber: string;
  emailAddress: string;
  secondaryEmailAddress: string;
  website: string;
  secondaryWebsite: string;
  address: string;
  secondaryAddress: string;
  socialLinks: string;
  gstNumber: string;
  notes: string;
  phones: string[];
  emails: string[];
  websites: string[];
  addresses: string[];
  socialLinksList: string[];
  confidence: Record<string, number>;
};

const unique = (values: string[]) =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))];

export function parseScanContact(raw: ScanContact): ParsedScanResult {
  const phones = unique([
    ...(raw.phones || []),
    ...(raw.mobileNumbers || []),
    ...(raw.telephoneNumbers || []),
    raw.phone || "",
    raw.phoneNumber || "",
  ]);
  const emails = unique([
    ...(raw.emails || []),
    raw.email || "",
    raw.emailAddress || "",
  ]);
  const websites = unique([...(raw.websites || []), raw.website || ""]);
  const addresses = unique([...(raw.addresses || []), raw.address || ""]);
  const socialLinksList = unique(raw.socialLinks || []);
  const gstNumbers = unique(raw.gstNumbers || []);

  const firstName = (raw.firstName || "").trim();
  const lastName = (raw.lastName || "").trim();
  const fromParts = [firstName, lastName].filter(Boolean).join(" ").trim();

  const fullName =
    (raw.fullName || raw.name || fromParts || "").trim();

  return {
    fullName,
    firstName: firstName || fullName.split(/\s+/)[0] || "",
    lastName: lastName || fullName.split(/\s+/).slice(1).join(" ") || "",
    designation: raw.designation || "",
    companyName: raw.companyName || raw.company || "",
    phoneNumber: phones[0] || "",
    secondaryPhoneNumber: phones[1] || "",
    emailAddress: emails[0] || "",
    secondaryEmailAddress: emails[1] || "",
    website: websites[0] || "",
    secondaryWebsite: websites[1] || "",
    address: addresses[0] || "",
    secondaryAddress: addresses[1] || "",
    socialLinks: socialLinksList.join(", "),
    gstNumber: gstNumbers[0] || "",
    notes: raw.notes || "",
    phones,
    emails,
    websites,
    addresses,
    socialLinksList,
    confidence: raw.confidence || {},
  };
}

export function emptyScanContact(): ScanContact {
  return {
    name: "",
    firstName: "",
    lastName: "",
    designation: "",
    company: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    notes: "",
    phones: [],
    mobileNumbers: [],
    telephoneNumbers: [],
    emails: [],
    websites: [],
    addresses: [],
    socialLinks: [],
    gstNumbers: [],
    confidence: {},
  };
}

export const CONFIDENCE_LOW_THRESHOLD = 75;
