export type ContactStatus = "synced" | "pending" | "failed";

export type Contact = {
  id: string;
  name: string;
  initials: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  status: ContactStatus;
  channels: { whatsapp: boolean; email: boolean };
  lastSync: string;
  accent: string;
};

const accents = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-fuchsia-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];

const seed: Omit<Contact, "id" | "initials" | "accent">[] = [
  { name: "Amelia Chen", company: "Northwind Labs", title: "VP Product", email: "amelia@northwind.io", phone: "+1 415 555 0142", status: "synced", channels: { whatsapp: true, email: true }, lastSync: "2m ago" },
  { name: "Marcus Holloway", company: "Lattice Group", title: "Head of Growth", email: "marcus@lattice.co", phone: "+44 20 7946 0958", status: "pending", channels: { whatsapp: true, email: false }, lastSync: "Queued" },
  { name: "Priya Raman", company: "Helix Robotics", title: "Director of Engineering", email: "priya@helixrobotics.com", phone: "+91 98765 43210", status: "synced", channels: { whatsapp: false, email: true }, lastSync: "11m ago" },
  { name: "Sofia Marquez", company: "Atlas & Co.", title: "Founder", email: "sofia@atlasand.co", phone: "+34 91 123 4567", status: "failed", channels: { whatsapp: true, email: true }, lastSync: "Failed" },
  { name: "Daniel Park", company: "Vector Capital", title: "Principal", email: "dpark@vectorcap.com", phone: "+1 212 555 0177", status: "synced", channels: { whatsapp: false, email: true }, lastSync: "1h ago" },
  { name: "Yuki Tanaka", company: "Mori Studio", title: "Design Lead", email: "yuki@mori.studio", phone: "+81 3 1234 5678", status: "pending", channels: { whatsapp: true, email: true }, lastSync: "Queued" },
  { name: "Olivia Bennett", company: "Forge Health", title: "Chief of Staff", email: "olivia@forge.health", phone: "+1 617 555 0119", status: "synced", channels: { whatsapp: true, email: true }, lastSync: "3h ago" },
  { name: "Rahul Mehta", company: "Quanta Cloud", title: "Sales Director", email: "rahul@quanta.cloud", phone: "+91 22 6789 0123", status: "synced", channels: { whatsapp: false, email: true }, lastSync: "Yesterday" },
  { name: "Elena Rossi", company: "Stellar Mobility", title: "BD Manager", email: "elena@stellar.mobility", phone: "+39 02 1234 5678", status: "failed", channels: { whatsapp: true, email: false }, lastSync: "Failed" },
  { name: "Thomas Lemaire", company: "Maison & Vine", title: "Partner", email: "thomas@maisonvine.fr", phone: "+33 1 4356 7890", status: "synced", channels: { whatsapp: true, email: true }, lastSync: "2d ago" },
];

export const contacts: Contact[] = seed.map((c, i) => ({
  ...c,
  id: `c-${i + 1}`,
  initials: c.name.split(" ").map((n) => n[0]).slice(0, 2).join(""),
  accent: accents[i % accents.length],
}));

export const kpis = [
  { label: "Total Contacts", value: "2,418", trend: "+12.4%", up: true },
  { label: "Pending Queue", value: "37", trend: "-8.2%", up: true },
  { label: "Messages Sent", value: "1,892", trend: "+24.1%", up: true },
  { label: "Sync Success Rate", value: "98.6%", trend: "+0.4%", up: true },
];

export const queueActivity = [
  { id: 1, label: "Synced 12 contacts to CRM", time: "Just now", tone: "success" as const },
  { id: 2, label: "WhatsApp message sent to Amelia Chen", time: "2m ago", tone: "primary" as const },
  { id: 3, label: "Queued 3 cards while offline", time: "14m ago", tone: "warning" as const },
  { id: 4, label: "OCR processed batch #248", time: "21m ago", tone: "muted" as const },
  { id: 5, label: "Retry succeeded for Sofia Marquez", time: "38m ago", tone: "success" as const },
];

export const scanTrend = Array.from({ length: 14 }, (_, i) => ({
  day: `D${i + 1}`,
  scans: Math.round(40 + Math.sin(i / 2) * 18 + Math.random() * 14),
  synced: Math.round(35 + Math.sin(i / 2) * 16 + Math.random() * 12),
}));

export const queuePerformance = [
  { name: "Mon", queued: 24, synced: 22 },
  { name: "Tue", queued: 31, synced: 30 },
  { name: "Wed", queued: 18, synced: 18 },
  { name: "Thu", queued: 42, synced: 39 },
  { name: "Fri", queued: 35, synced: 33 },
  { name: "Sat", queued: 12, synced: 12 },
  { name: "Sun", queued: 9, synced: 9 },
];

export const contactGrowth = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  total: 400 + i * 165 + Math.round(Math.random() * 60),
}));

export const deliveryMix = [
  { name: "WhatsApp", value: 1182 },
  { name: "Email", value: 710 },
  { name: "Failed", value: 26 },
];

export const pendingUploads = [
  { id: "u1", name: "Batch from Web Summit", size: "12 cards", progress: 78 },
  { id: "u2", name: "Booth scans · Hall 4", size: "5 cards", progress: 42 },
  { id: "u3", name: "Investor mixer", size: "3 cards", progress: 16 },
];

export const failedItems = [
  { id: "f1", name: "Sofia Marquez · Atlas & Co.", reason: "Network timeout" },
  { id: "f2", name: "Elena Rossi · Stellar Mobility", reason: "Duplicate phone number" },
];
