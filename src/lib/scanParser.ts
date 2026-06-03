import type { ScanContact } from "./scanResult";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_REGEX = /(?:https?:\/\/|www\.)[\w\-\.]+\.[a-zA-Z]{2,}(?:\/[\w\-\.\?\=\&\/#]*)?/g;
const PHONE_REGEX = /(?:(?:\+|00)\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{3,4}(?:[\s\-.]?\d{2,4})?/g;
const SOCIAL_REGEX = /\b(?:linkedin\.com|twitter\.com|facebook\.com|instagram\.com|x\.com|tiktok\.com|behance\.net|dribbble\.com)\S*/gi;
const COMPANY_SUFFIX_REGEX = /\b(?:inc|llc|ltd|corp|co|corporation|company|group|solutions|technologies|studios|labs|partners)\b/i;
const DESIGNATION_KEYWORDS = /\b(?:CEO|CTO|CFO|COO|CMO|Founder|President|Director|Manager|Engineer|Developer|Designer|Consultant|Architect|Specialist|Coordinator|Executive|Lead|Head|VP|Vice President|Partner|Principal|Officer|Associate|Analyst)\b/i;
const ADDRESS_KEYWORDS = /\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|suite|ste|floor|fl|building|bldg|place|pl|court|ct|parkway|pkwy|square|sq)\b/i;

const isLikelyNameLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 60) return false;
  if (EMAIL_REGEX.test(trimmed) || URL_REGEX.test(trimmed) || PHONE_REGEX.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 5) return false;
  const alphaWords = words.filter((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word));
  return alphaWords.length >= Math.max(1, words.length - 1);
};

const normalizeLine = (line: string): string => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

const uniqueItems = (items: string[]): string[] => [...new Set(items.map((value) => value.trim()).filter(Boolean))];

const cleanLines = (rawText: string): string[] =>
  rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 2)
    .map((line) => line.replace(/\s{2,}/g, " "));

const extractMatches = (lines: string[], regex: RegExp) => {
  const matches: string[] = [];
  const remaining: string[] = [];

  for (const line of lines) {
    const found = [...line.matchAll(regex)].map((match) => match[0].trim());
    if (found.length) {
      matches.push(...found);
      const cleaned = line.replace(regex, "").trim();
      if (cleaned.length > 2) {
        remaining.push(cleaned);
      }
    } else {
      remaining.push(line);
    }
  }

  return { matches: uniqueItems(matches), remaining };
};

const extractPhones = (lines: string[]) => {
  const phones: string[] = [];
  const remaining: string[] = [];

  for (const line of lines) {
    const candidates = [...line.matchAll(PHONE_REGEX)].map((match) => match[0].trim());
    let cleanLine = line;
    let foundAny = false;

    for (const candidate of candidates) {
      const digits = candidate.replace(/[^\d]/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        phones.push(candidate);
        cleanLine = cleanLine.replace(candidate, "").trim();
        foundAny = true;
      }
    }

    if (!foundAny) {
      remaining.push(line);
    } else if (cleanLine.length > 2) {
      remaining.push(cleanLine);
    }
  }

  return { phones: uniqueItems(phones), remaining };
};

const extractSocialLinks = (lines: string[]) => {
  const { matches, remaining } = extractMatches(lines, SOCIAL_REGEX);
  return { socialLinks: matches, remaining };
};

const extractAddress = (lines: string[]) => {
  const addressLines: string[] = [];
  const remaining: string[] = [];

  for (const line of lines) {
    if (ADDRESS_KEYWORDS.test(line) || /\d{2,5}/.test(line) && line.includes(",")) {
      addressLines.push(line);
    } else {
      remaining.push(line);
    }
  }

  return { addresses: addressLines, remaining };
};

const extractNameAndDesignation = (lines: string[]) => {
  let name = "";
  let designation = "";
  const remaining = [...lines];

  const titleIdx = remaining.findIndex((line) => DESIGNATION_KEYWORDS.test(line));
  if (titleIdx >= 0) {
    designation = remaining[titleIdx];
    if (titleIdx > 0 && isLikelyNameLine(remaining[titleIdx - 1])) {
      name = remaining[titleIdx - 1];
      remaining.splice(titleIdx - 1, 2);
      return { name, designation, remaining };
    }
  }

  if (!name) {
    const nameIdx = remaining.findIndex((line) => isLikelyNameLine(line));
    if (nameIdx >= 0) {
      name = remaining[nameIdx];
      remaining.splice(nameIdx, 1);
    }
  }

  return { name, designation, remaining };
};

const extractCompany = (lines: string[], emails: string[], websites: string[]) => {
  for (const line of lines) {
    if (COMPANY_SUFFIX_REGEX.test(line)) {
      return line;
    }
  }

  const sourceHints = [...emails, ...websites];
  for (const hint of sourceHints) {
    const domainMatch = hint.match(/(?:@|(?:www\.)?)([a-zA-Z0-9\-]+)\.[a-zA-Z]{2,}/);
    if (domainMatch) {
      const maybeCompany = domainMatch[1].replace(/[-_]/g, " ");
      if (!/^(gmail|yahoo|hotmail|outlook|icloud|protonmail)$/.test(maybeCompany.toLowerCase())) {
        return maybeCompany
          .split(/\s+/)
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(" ");
      }
    }
  }

  for (const line of lines) {
    if (!isLikelyNameLine(line) && line.length < 50) {
      return line;
    }
  }

  return "";
};

const inferNames = (fullName: string) => {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
};

export function parseOcrText(rawText: string): ScanContact {
  const lines = cleanLines(rawText);
  const { matches: emails, remaining: linesAfterEmails } = extractMatches(lines, EMAIL_REGEX);
  const { matches: websites, remaining: linesAfterWebsites } = extractMatches(linesAfterEmails, URL_REGEX);
  const phonesResult = extractPhones(linesAfterWebsites);
  const { socialLinks, remaining: linesAfterSocial } = extractSocialLinks(phonesResult.remaining);
  const addressResult = extractAddress(linesAfterSocial);
  const { name, designation, remaining: linesAfterName } = extractNameAndDesignation(addressResult.remaining);
  const companyName = extractCompany(linesAfterName, emails, websites);

  const fullName = name || (emails[0] ? emails[0].split("@")[0].replace(/[._\-]/g, " ") : "");
  const { firstName, lastName } = inferNames(fullName);
  const notes = linesAfterName.filter((line) => line !== companyName && line !== designation).join(" | ");

  return {
    fullName: fullName.trim(),
    firstName,
    lastName,
    designation,
    company: companyName,
    companyName,
    phone: phonesResult.phones[0] || "",
    secondaryPhone: phonesResult.phones[1] || "",
    phones: phonesResult.phones,
    email: emails[0] || "",
    secondaryEmail: emails[1] || "",
    emails,
    website: websites[0] || "",
    secondaryWebsite: websites[1] || "",
    websites,
    address: addressResult.addresses[0] || "",
    secondaryAddress: addressResult.addresses[1] || "",
    addresses: addressResult.addresses,
    socialLinks: socialLinks.join(", "),
    socialLinksList: socialLinks,
    notes,
    confidence: {},
  };
}
