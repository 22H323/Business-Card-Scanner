import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./lib/prisma.js";
import type { ContactSyncStatus } from "@prisma/client";

dotenv.config();

const app = express();
const PORT = Number(process.env.LOCAL_DB_PORT || 3001);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));

type ContactInput = {
  fullName: string;
  firstName?: string;
  lastName?: string;
  designation?: string;
  company?: string;
  phone?: string;
  secondaryPhone?: string;
  email?: string;
  secondaryEmail?: string;
  website?: string;
  secondaryWebsite?: string;
  address?: string;
  secondaryAddress?: string;
  socialLinks?: string;
  gstNumber?: string;
  notes?: string;
  cardImageBase64?: string;
  syncStatus?: ContactSyncStatus;
  firebaseId?: string;
  zohoLeadId?: string;
};

function toApiContact(row: Awaited<ReturnType<typeof prisma.contact.findMany>>[number]) {
  return {
    id: row.id,
    name: row.fullName,
    fullName: row.fullName,
    firstName: row.firstName,
    lastName: row.lastName,
    designation: row.designation,
    title: row.designation,
    company: row.company,
    phone: row.phone,
    secondaryPhone: row.secondaryPhone,
    email: row.email,
    secondaryEmail: row.secondaryEmail,
    website: row.website,
    secondaryWebsite: row.secondaryWebsite,
    address: row.address,
    secondaryAddress: row.secondaryAddress,
    socialLinks: row.socialLinks,
    gstNumber: row.gstNumber,
    notes: row.notes,
    cardImageBase64: row.cardImageBase64,
    syncStatus: row.syncStatus,
    firebaseId: row.firebaseId,
    zohoLeadId: row.zohoLeadId,
    status:
      row.syncStatus === "synced_zoho"
        ? "synced"
        : row.syncStatus === "failed"
          ? "failed"
          : "pending",
    source: "localdb" as const,
    created_at: row.createdAt.toISOString(),
    lastSync: row.updatedAt.toISOString(),
    channels: {
      whatsapp: Boolean(row.phone),
      email: Boolean(row.email),
    },
  };
}

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "cardsync-local-db", database: "postgresql" });
  } catch (err) {
    res.status(503).json({
      ok: false,
      service: "cardsync-local-db",
      error: err instanceof Error ? err.message : "Database unavailable",
    });
  }
});

app.get("/api/contacts", async (_req, res) => {
  try {
    const rows = await prisma.contact.findMany({ orderBy: { createdAt: "desc" } });
    res.json(rows.map(toApiContact));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list contacts" });
  }
});

app.get("/api/contacts/:id", async (req, res) => {
  try {
    const row = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(toApiContact(row));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get contact" });
  }
});

app.post("/api/contacts", async (req, res) => {
  try {
    const body = req.body as ContactInput;
    if (!body.fullName?.trim()) {
      res.status(400).json({ error: "fullName is required" });
      return;
    }

    const row = await prisma.contact.create({
      data: {
        fullName: body.fullName.trim(),
        firstName: body.firstName?.trim() || "",
        lastName: body.lastName?.trim() || "",
        designation: body.designation?.trim() || "",
        company: body.company?.trim() || "",
        phone: body.phone?.trim() || "",
        secondaryPhone: body.secondaryPhone?.trim() || "",
        email: body.email?.trim() || "",
        secondaryEmail: body.secondaryEmail?.trim() || "",
        website: body.website?.trim() || "",
        secondaryWebsite: body.secondaryWebsite?.trim() || "",
        address: body.address?.trim() || "",
        secondaryAddress: body.secondaryAddress?.trim() || "",
        socialLinks: body.socialLinks?.trim() || "",
        gstNumber: body.gstNumber?.trim() || "",
        notes: body.notes?.trim() || "",
        cardImageBase64: body.cardImageBase64 || null,
        syncStatus: body.syncStatus || "local_only",
        firebaseId: body.firebaseId || null,
        zohoLeadId: body.zohoLeadId || null,
      },
    });

    res.status(201).json({ success: true, id: row.id, contact: toApiContact(row) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create contact" });
  }
});

app.put("/api/contacts/:id", async (req, res) => {
  try {
    const body = req.body as ContactInput;
    const row = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        fullName: body.fullName?.trim(),
        firstName: body.firstName?.trim(),
        lastName: body.lastName?.trim(),
        designation: body.designation?.trim(),
        company: body.company?.trim(),
        phone: body.phone?.trim(),
        secondaryPhone: body.secondaryPhone?.trim(),
        email: body.email?.trim(),
        secondaryEmail: body.secondaryEmail?.trim(),
        website: body.website?.trim(),
        secondaryWebsite: body.secondaryWebsite?.trim(),
        address: body.address?.trim(),
        secondaryAddress: body.secondaryAddress?.trim(),
        socialLinks: body.socialLinks?.trim(),
        gstNumber: body.gstNumber?.trim(),
        notes: body.notes?.trim(),
        cardImageBase64: body.cardImageBase64,
        syncStatus: body.syncStatus,
        firebaseId: body.firebaseId,
        zohoLeadId: body.zohoLeadId,
      },
    });
    res.json({ success: true, id: row.id, contact: toApiContact(row) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to update contact" });
  }
});

app.patch("/api/contacts/:id/sync-status", async (req, res) => {
  try {
    const { syncStatus, firebaseId, zohoLeadId } = req.body as {
      syncStatus?: ContactSyncStatus;
      firebaseId?: string;
      zohoLeadId?: string;
    };
    const row = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        syncStatus,
        firebaseId: firebaseId ?? undefined,
        zohoLeadId: zohoLeadId ?? undefined,
      },
    });
    res.json({ success: true, contact: toApiContact(row) });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to update sync status" });
  }
});

app.delete("/api/contacts", async (_req, res) => {
  try {
    const result = await prisma.contact.deleteMany();
    res.json({ success: true, deleted: result.count });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete all contacts" });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to delete contact" });
  }
});

app.listen(PORT, () => {
  console.log(`CardSync local DB API running at http://127.0.0.1:${PORT}`);
  console.log(`Health: http://127.0.0.1:${PORT}/health`);
});
