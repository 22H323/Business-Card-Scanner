import { validationRules } from "@/constants/validationRules";
import type { LeadField } from "@/constants/formFields";

export type ValidationErrors = Record<string, string>;

export const validateField = (field: LeadField, value: string) => {
  if (field.required && !validationRules.required(value)) return `${field.label} is required.`;
  if (field.component === "EmailInput" && !validationRules.email(value)) return "Please enter a valid email address.";
  if (field.component === "PhoneInput" && !validationRules.phone(value)) return "Please enter a valid phone number.";
  if (field.component === "UrlInput" && !validationRules.url(value)) return "Please enter a valid website URL.";
  return "";
};
