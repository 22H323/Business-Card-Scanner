import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { leadFields } from "@/constants/formFields";
import { useUpload } from "@/hooks/useUpload";
import { useForm } from "@/hooks/useForm";
import { useToast } from "@/hooks/useToast";
import { PageContainer } from "@/components/layout/PageContainer";
import { Navbar } from "@/components/layout/Navbar";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/common/Card";
import { UploadZone } from "@/components/upload/UploadZone";
import { ImagePreview } from "@/components/preview/ImagePreview";
import { OCRPreview } from "@/components/preview/OCRPreview";
import { FormSection } from "@/components/form/FormSection";
import { FormGrid } from "@/components/form/FormGrid";
import { FormRow } from "@/components/form/FormRow";
import { FieldRenderer } from "@/components/form/FieldRenderer";
import { FormActions } from "@/components/form/FormActions";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/common/Button";
import { CameraCapture } from "@/components/camera/CameraCapture";
import {
  ExtractedValuePicker,
  createPickerItems,
  resolvePickerValues,
  type PickerItem,
} from "@/components/review/ExtractedValuePicker";
import {
  DuplicateResolutionModal,
  type DuplicateAction,
} from "@/components/review/DuplicateResolutionModal";
import { buildContactBody, resolveCardImageFile, type LeadPayload } from "@/lib/cardImage";
import { getConnectionMode, isOfflineMode } from "@/lib/connectionMode";
import {
  checkStorageHealth,
  saveContact,
  updateContact,
  storageLabel,
  syncContactToZohoStorage,
} from "@/lib/contactStorage";
import { checkForDuplicates, type DuplicateMatch } from "@/lib/duplicateDetection";
import { loadUserSettings } from "@/lib/settingsStorage";
import { parseScanContact } from "@/lib/scanResult";
import { scanFileAndStore } from "@/lib/scanPipeline";
import { loadScanSession, readFileAsDataUrl, dataUrlToFile, isEmptyScanContact } from "@/lib/scanSession";

const sectionMap = {
  basic: "Basic Information",
  contact: "Contact Information",
  company: "Company Information",
  extra: "Additional Details",
} as const;

const initialValues = leadFields.reduce<Record<string, string>>((acc, field) => {
  acc[field.name] = "";
  return acc;
}, {});

type PickerState = {
  phones: PickerItem[];
  emails: PickerItem[];
  websites: PickerItem[];
  addresses: PickerItem[];
  social: PickerItem[];
};

const emptyPickers = (): PickerState => ({
  phones: [],
  emails: [],
  websites: [],
  addresses: [],
  social: [],
});

export const LeadReviewPage = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingPayloadRef = useRef<LeadPayload | null>(null);
  const pendingImageRef = useRef<File | null>(null);
  const autoExtractedRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedScanImage, setSavedScanImage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pickers, setPickers] = useState<PickerState>(emptyPickers);
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  const { success, error, info } = useToast();
  const upload = useUpload();
  const form = useForm(leadFields, initialValues);

  const applyPickerToForm = (next: PickerState) => {
    const phones = resolvePickerValues(next.phones);
    const emails = resolvePickerValues(next.emails);
    const websites = resolvePickerValues(next.websites);
    const addresses = resolvePickerValues(next.addresses);
    const social = resolvePickerValues(next.social);

    form.setMany({
      phoneNumber: phones.primary,
      secondaryPhoneNumber: phones.secondary,
      emailAddress: emails.primary,
      secondaryEmailAddress: emails.secondary,
      website: websites.primary,
      secondaryWebsite: websites.secondary,
      address: addresses.primary,
      secondaryAddress: addresses.secondary,
      socialLinks: social.allIncluded.join(", "),
    });
  };

  const applyScanData = useCallback((raw: ReturnType<typeof parseScanContact>) => {
    const nextPickers: PickerState = {
      phones: createPickerItems(raw.phones),
      emails: createPickerItems(raw.emails),
      websites: createPickerItems(raw.websites),
      addresses: createPickerItems(raw.addresses),
      social: createPickerItems(raw.socialLinksList),
    };
    setPickers(nextPickers);
    setConfidence(raw.confidence);

    form.setMany({
      fullName: raw.fullName,
      firstName: raw.firstName,
      lastName: raw.lastName,
      designation: raw.designation,
      companyName: raw.companyName,
      phoneNumber: raw.phoneNumber,
      secondaryPhoneNumber: raw.secondaryPhoneNumber,
      emailAddress: raw.emailAddress,
      secondaryEmailAddress: raw.secondaryEmailAddress,
      website: raw.website,
      secondaryWebsite: raw.secondaryWebsite,
      address: raw.address,
      secondaryAddress: raw.secondaryAddress,
      socialLinks: raw.socialLinks,
      gstNumber: raw.gstNumber,
    });
  }, [form.setMany]);

  const loadFromSession = useCallback(() => {
    const { contact, imageDataUrl, meta } = loadScanSession();
    if (imageDataUrl) setSavedScanImage(imageDataUrl);
    if (contact) applyScanData(parseScanContact(contact));
    setOcrWarning(meta?.ocrWarning ?? null);
  }, [applyScanData]);

  const handleFormChange = (name: string, value: string) => {
    form.setValue(name, value);
    if (name === "firstName" || name === "lastName") {
      const first = name === "firstName" ? value : form.values.firstName;
      const last = name === "lastName" ? value : form.values.lastName;
      const combined = [first, last].filter(Boolean).join(" ").trim();
      if (combined) form.setValue("fullName", combined);
    }
  };

  const resolvedFullName =
    form.values.fullName.trim() ||
    [form.values.firstName, form.values.lastName].filter(Boolean).join(" ").trim();

  const hasDetectedName = Boolean(resolvedFullName);

  const isOptionalField = (field: typeof leadFields[number]) =>
    field.name === "firstName" ||
    field.name === "lastName" ||
    field.name.startsWith("secondary") ||
    field.section === "extra";

  const shouldShowField = (field: typeof leadFields[number]) => {
    if (!showAdvancedFields && isOptionalField(field)) {
      if (field.name === "firstName" || field.name === "lastName") {
        return !form.values.fullName.trim() || Boolean(form.values[field.name]);
      }
      return Boolean(form.values[field.name]);
    }
    return true;
  };

  const visibleFields = leadFields.filter(shouldShowField);

  const hasOptionalValues = leadFields.some((field) =>
    isOptionalField(field) && Boolean(form.values[field.name]),
  );

  const [scanRevision, setScanRevision] = useState(0);

  useEffect(() => {
    loadFromSession();
    const onScanUpdated = () => {
      loadFromSession();
      setScanRevision((n) => n + 1);
    };
    window.addEventListener("cs-scan-updated", onScanUpdated);
    return () => window.removeEventListener("cs-scan-updated", onScanUpdated);
  }, [loadFromSession]);

  const updatePicker = (key: keyof PickerState, items: PickerItem[]) => {
    const next = { ...pickers, [key]: items };
    setPickers(next);
    applyPickerToForm(next);
  };

  const runExtraction = async (file: File) => {
    setIsExtracting(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSavedScanImage(dataUrl);
      const { contact, ocrWarning: warning } = await scanFileAndStore(file, dataUrl);
      applyScanData(parseScanContact(contact));
      setOcrWarning(warning ?? null);
      if (warning) {
        info(warning);
      } else {
        success("OCR extraction complete. Review and verify all fields.");
      }
    } catch (err) {
      console.error(err);
      info("Could not extract text. Enter contact details manually.");
      setPickers(emptyPickers());
      setConfidence({});
    } finally {
      setIsExtracting(false);
    }
  };

  // Re-run OCR when a card image exists but extraction was skipped (e.g. previous offline bug).
  useEffect(() => {
    if (autoExtractedRef.current || isExtracting) return;

    const { contact, imageDataUrl } = loadScanSession();
    if (!imageDataUrl || !isEmptyScanContact(contact)) return;

    autoExtractedRef.current = true;
    void (async () => {
      try {
        const file = await dataUrlToFile(imageDataUrl, "scanned-card.jpg");
        await runExtraction(file);
      } catch (err) {
        console.error("Auto OCR retry failed:", err);
        autoExtractedRef.current = false;
      }
    })();
  }, [scanRevision, isExtracting]);

  const buildPayload = (): LeadPayload => ({
    fullName: resolvedFullName,
    firstName: form.values.firstName,
    lastName: form.values.lastName,
    designation: form.values.designation,
    company: form.values.companyName,
    phone: form.values.phoneNumber,
    secondaryPhone: form.values.secondaryPhoneNumber,
    email: form.values.emailAddress,
    secondaryEmail: form.values.secondaryEmailAddress,
    website: form.values.website,
    secondaryWebsite: form.values.secondaryWebsite,
    address: form.values.address,
    secondaryAddress: form.values.secondaryAddress,
    socialLinks: form.values.socialLinks,
    gstNumber: form.values.gstNumber,
  });

  const persistContact = async (
    payload: LeadPayload,
    imageFile: File | null,
    existingId?: string,
    merge = false,
  ) => {
    const imageDataUrl = upload.previewUrl || savedScanImage || undefined;
    const storageUp = await checkStorageHealth();
    const label = storageLabel();

    if (storageUp) {
      let contactId = existingId;

      if (existingId) {
        if (merge && duplicateMatch) {
          const existing = duplicateMatch.contact;
          const merged: LeadPayload = {
            ...payload,
            phone: payload.phone || String(existing.phone || ""),
            email: payload.email || String(existing.email || ""),
            website: payload.website || String(existing.website || ""),
            address: payload.address || String(existing.address || ""),
          };
          await updateContact(existingId, merged);
        } else {
          await updateContact(existingId, payload);
        }
      } else {
        const settings = loadUserSettings();
        const saved = await saveContact(payload, imageDataUrl, {
          connectionMode: getConnectionMode(),
          skipWhatsApp: !settings.whatsappNotificationsEnabled,
          skipEmail: !settings.emailNotificationsEnabled,
        });
        contactId = saved.id;

        if (saved.queued) {
          info("Saved to queue. Will sync to Zoho CRM automatically when you're online.");
          sessionStorage.removeItem("latestScanResult");
          navigate({ to: "/queue" });
          return;
        }

        const zohoDoneOnSave =
          Boolean(saved.zohoSynced) || Boolean(saved.zohoLeadId) || Boolean(saved.zohoError);

        if (zohoDoneOnSave) {
          if (saved.zohoError) {
            success(`Saved to ${label}.`);
            error(`Zoho sync failed: ${saved.zohoError}. Use Sync to Zoho on Contacts.`);
          } else if (saved.alreadySynced) {
            success("Saved — contact is already in Zoho CRM.");
          } else {
            success("Saved and synced to Zoho CRM.");
            if (
              settings.emailNotificationsEnabled ||
              settings.whatsappNotificationsEnabled
            ) {
              info("Thank-you email/WhatsApp are sending in the background.");
            }
          }
        } else if (!existingId) {
          const shouldSyncZoho =
            !isOfflineMode() && navigator.onLine && Boolean(contactId);

          if (shouldSyncZoho && contactId) {
            try {
              const settings = loadUserSettings();
              const zohoResult = await syncContactToZohoStorage(contactId, {
                skipWhatsApp: !settings.whatsappNotificationsEnabled,
                skipEmail: !settings.emailNotificationsEnabled,
              });
              if (zohoResult.alreadySynced) {
                success("Saved — contact is already in Zoho CRM.");
              } else {
                success("Saved and synced to Zoho CRM.");
                info("Thank-you email/WhatsApp are sending in the background.");
              }
            } catch (zohoErr: unknown) {
              const msg =
                zohoErr instanceof Error ? zohoErr.message : "Zoho sync failed";
              success(`Saved to ${label}.`);
              error(`Zoho sync failed: ${msg}. Use Sync to Zoho on Contacts.`);
            }
          } else {
            success(`Saved to ${label}. Sync to Zoho from Contacts when online.`);
          }
        }
      }

      if (existingId) {
        success(`Contact updated in ${label}.`);
      }

      sessionStorage.removeItem("latestScanResult");
      navigate({ to: "/contacts" });
      return;
    }

    const settings = loadUserSettings();
    const saved = await saveContact(payload, imageDataUrl, {
      connectionMode: getConnectionMode(),
      skipWhatsApp: !settings.whatsappNotificationsEnabled,
      skipEmail: !settings.emailNotificationsEnabled,
    });
    info("Saved to browser queue. Will sync when storage is available.");
    sessionStorage.removeItem("latestScanResult");
    navigate({ to: "/queue" });
  };

  const executeSave = async (action: DuplicateAction = "new") => {
    if (action === "discard") {
      setShowDuplicateModal(false);
      setDuplicateMatch(null);
      return;
    }

    const payload = pendingPayloadRef.current || buildPayload();
    const imageFile = pendingImageRef.current;

    setIsSaving(true);
    try {
      if (action === "update" && duplicateMatch?.contact.id) {
        await persistContact(payload, imageFile, duplicateMatch.contact.id, false);
      } else if (action === "merge" && duplicateMatch?.contact.id) {
        await persistContact(payload, imageFile, duplicateMatch.contact.id, true);
      } else {
        await persistContact(payload, imageFile);
      }
    } catch (saveError) {
      console.error(saveError);
      error(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setIsSaving(false);
      setShowDuplicateModal(false);
      setDuplicateMatch(null);
    }
  };

  const saveLead = async () => {
    const fullName = resolvedFullName;
    if (!fullName) {
      error("Please enter a name before saving.");
      return;
    }

    if (!form.validate({ fullName })) {
      error("Please resolve validation errors before saving.");
      return;
    }

    if (!form.values.fullName.trim()) {
      form.setValue("fullName", fullName);
    }

    const payload = buildPayload();
    const imageFile = await resolveCardImageFile(upload.file, upload.previewUrl, savedScanImage);
    pendingPayloadRef.current = payload;
    pendingImageRef.current = imageFile;

    const { duplicates } = await checkForDuplicates(payload);
    if (duplicates.length > 0) {
      setDuplicateMatch(duplicates[0]);
      setShowDuplicateModal(true);
      return;
    }

    await executeSave("new");
  };

  const groupedFields = {
    basic: visibleFields.filter((f) => f.section === "basic"),
    contact: visibleFields.filter((f) => f.section === "contact"),
    company: visibleFields.filter((f) => f.section === "company"),
    extra: visibleFields.filter((f) => f.section === "extra"),
  };

  const visibleSections = (Object.keys(groupedFields) as Array<keyof typeof groupedFields>).filter(
    (section) => groupedFields[section].length > 0,
  );

  const hasMultiValues =
    pickers.phones.length > 1 ||
    pickers.emails.length > 1 ||
    pickers.websites.length > 1 ||
    pickers.addresses.length > 1 ||
    pickers.social.length > 1;

  return (
    <PageContainer>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            upload.onFileSelect(file);
            runExtraction(file);
          }
        }}
      />
      <Navbar
        title="Review & Save Contact"
        subtitle="Verify extracted fields, then save. In Online mode, contacts sync to Zoho automatically."
      />
      <AppLayout
        left={
          <>
            <Card>
              {upload.previewUrl || savedScanImage ? (
                <ImagePreview
                  src={upload.previewUrl || savedScanImage}
                  fileName={upload.file?.name || "Scanned card"}
                  onClear={() => {
                    upload.clear();
                    setSavedScanImage("");
                    sessionStorage.removeItem("latestScanImage");
                  }}
                />
              ) : (
                <UploadZone
                  isDragging={isDragging}
                  error={upload.error}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      upload.onFileSelect(file);
                      runExtraction(file);
                    }
                  }}
                  onPick={() => inputRef.current?.click()}
                />
              )}
              <div className="mt-3 flex gap-2">
                <Button variantType="secondary" className="flex-1" onClick={() => setCameraOpen(true)}>
                  Use camera
                </Button>
                <Button variantType="secondary" className="flex-1" onClick={() => navigate({ to: "/scan" })}>
                  Retake scan
                </Button>
              </div>
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Extracted preview</h3>
                {isExtracting ? <LoadingSpinner label="Extracting…" /> : null}
              </div>
              <OCRPreview values={form.values} />
            </Card>
          </>
        }
        right={
          <Card className="h-full">
            {hasMultiValues && (
              <FormSection title="Select primary & secondary values" className="mb-5">
                <p className="mb-4 text-xs text-muted-foreground">
                  Check values to include. Mark one as Primary and optionally one as Secondary. Uncheck to discard.
                </p>
                <div className="space-y-5">
                  {pickers.phones.length > 1 && (
                    <ExtractedValuePicker label="Phone numbers" items={pickers.phones} onChange={(items) => updatePicker("phones", items)} />
                  )}
                  {pickers.emails.length > 1 && (
                    <ExtractedValuePicker label="Email addresses" items={pickers.emails} onChange={(items) => updatePicker("emails", items)} />
                  )}
                  {pickers.websites.length > 1 && (
                    <ExtractedValuePicker label="Websites" items={pickers.websites} onChange={(items) => updatePicker("websites", items)} />
                  )}
                  {pickers.addresses.length > 1 && (
                    <ExtractedValuePicker label="Addresses" items={pickers.addresses} onChange={(items) => updatePicker("addresses", items)} />
                  )}
                  {pickers.social.length > 1 && (
                    <ExtractedValuePicker label="Social media links" items={pickers.social} onChange={(items) => updatePicker("social", items)} />
                  )}
                </div>
              </FormSection>
            )}

            <FormSection title="Review fields" className="mb-5">
              <div className="group flex flex-col gap-3 rounded-3xl border border-border/60 bg-gradient-to-r from-sky-50 to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:from-slate-900 dark:to-slate-950 text-sm text-slate-900 dark:text-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Show optional fields</p>
                  <Button
                    type="button"
                    variantType={showAdvancedFields ? "secondary" : "primary"}
                    onClick={() => setShowAdvancedFields((prev) => !prev)}
                    className="h-10 transition-transform duration-200 group-hover:scale-[1.01] hover:-translate-y-0.5"
                  >
                    {showAdvancedFields ? "Collapse optional fields" : "Show optional fields"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap the button to reveal extra fields only when needed, keeping the form clean and fast.
                </p>
              </div>
            </FormSection>
            {(ocrWarning || !hasDetectedName) && (
              <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                {ocrWarning ? (
                  <>
                    <p className="font-medium">OCR could not read this card</p>
                    <p className="mt-1 text-amber-800/90 dark:text-amber-100/90">{ocrWarning}</p>
                    <p className="mt-2 text-xs opacity-90">
                      On Netlify, browser OCR runs automatically when the server cannot read the card. You can also edit all fields manually below.
                    </p>
                  </>
                ) : (
                  <p>
                    No name detected from the scan. Type the name in Full Name (or First + Last Name) before saving.
                  </p>
                )}
              </div>
            )}

            {visibleSections.map((section, index) => (
              <FormSection
                key={section}
                title={sectionMap[section]}
                className={index === 0 ? "" : "border-t border-border/60 pt-5"}
              >
                <FormGrid>
                  {groupedFields[section].map((field) => (
                    <FormRow
                      key={field.name}
                      className={field.component === "TextAreaInput" ? "md:col-span-2" : ""}
                    >
                      <FieldRenderer
                        field={field}
                        value={form.values[field.name] || ""}
                        error={form.errors[field.name]}
                        confidence={field.confidenceKey ? confidence[field.confidenceKey] : undefined}
                        onChange={handleFormChange}
                      />
                    </FormRow>
                  ))}
                </FormGrid>
              </FormSection>
            ))}

            <p className="mb-3 mt-4 text-xs text-muted-foreground">
              Save flow: **local PostgreSQL** on your PC → manual **Zoho** sync from Contacts. If local DB is off, cards go to the browser queue.
            </p>
            <FormActions
              onReset={() => {
                sessionStorage.removeItem("latestScanResult");
                navigate({ to: "/scan" });
              }}
              onSave={saveLead}
              saving={isSaving}
            />
          </Card>
        }
      />

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          upload.onFileSelect(file);
          runExtraction(file);
        }}
      />

      <DuplicateResolutionModal
        open={showDuplicateModal}
        match={duplicateMatch}
        incoming={pendingPayloadRef.current || buildPayload()}
        onResolve={executeSave}
      />
    </PageContainer>
  );
};
