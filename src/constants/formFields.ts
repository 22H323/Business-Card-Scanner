export type FieldComponentType = "TextInput" | "EmailInput" | "PhoneInput" | "UrlInput" | "TextAreaInput";

export type LeadField = {
  label: string;
  name: string;
  type: string;
  component: FieldComponentType;
  required?: boolean;
  placeholder?: string;
  section: "basic" | "contact" | "company" | "extra";
  confidenceKey?: string;
};

export const leadFields: LeadField[] = [
  { label: "Full Name", name: "fullName", type: "text", component: "TextInput", required: true, placeholder: "Enter full name", section: "basic", confidenceKey: "fullName" },
  { label: "First Name", name: "firstName", type: "text", component: "TextInput", placeholder: "First name", section: "basic", confidenceKey: "firstName" },
  { label: "Last Name", name: "lastName", type: "text", component: "TextInput", placeholder: "Last name", section: "basic", confidenceKey: "lastName" },
  { label: "Designation", name: "designation", type: "text", component: "TextInput", placeholder: "Job title", section: "basic", confidenceKey: "designation" },
  { label: "Company Name", name: "companyName", type: "text", component: "TextInput", required: true, placeholder: "Company", section: "company", confidenceKey: "companyName" },
  { label: "Primary Phone", name: "phoneNumber", type: "tel", component: "PhoneInput", required: true, placeholder: "Mobile or phone", section: "contact", confidenceKey: "phoneNumber" },
  { label: "Secondary Phone", name: "secondaryPhoneNumber", type: "tel", component: "PhoneInput", placeholder: "Optional second number", section: "contact" },
  { label: "Primary Email", name: "emailAddress", type: "email", component: "EmailInput", required: true, placeholder: "Email address", section: "contact", confidenceKey: "emailAddress" },
  { label: "Secondary Email", name: "secondaryEmailAddress", type: "email", component: "EmailInput", placeholder: "Optional second email", section: "contact" },
  { label: "Primary Website", name: "website", type: "url", component: "UrlInput", placeholder: "Website URL", section: "company", confidenceKey: "website" },
  { label: "Secondary Website", name: "secondaryWebsite", type: "url", component: "UrlInput", placeholder: "Additional website", section: "company" },
  { label: "Primary Address", name: "address", type: "text", component: "TextAreaInput", placeholder: "Street, city, state", section: "contact", confidenceKey: "address" },
  { label: "Secondary Address", name: "secondaryAddress", type: "text", component: "TextAreaInput", placeholder: "Additional address", section: "contact" },
  { label: "Social Media Links", name: "socialLinks", type: "text", component: "TextAreaInput", placeholder: "LinkedIn, Twitter, etc.", section: "extra" },
  { label: "GST / Tax Number", name: "gstNumber", type: "text", component: "TextInput", placeholder: "GST, PAN, TIN", section: "extra", confidenceKey: "gstNumber" },
];
