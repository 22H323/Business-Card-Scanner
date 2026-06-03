# CardSync AI — Premium SaaS UI Build Plan

A frontend-only, mobile-responsive multi-page app styled like Linear / Stripe / Notion, with a collapsible sidebar shell and 7 fully designed pages using mock data.

## Design system

Update `src/styles.css` tokens (oklch equivalents):

### `--background` ≈ #F8FAFC, `--card` #FFFFFF, `--foreground` #0F172A

- `--primary` #4F46E5 (indigo), `--primary-foreground` white
- `--muted-foreground` #64748B, soft border, subtle indigo→violet gradient token

Add `--shadow-soft`, `--shadow-elevated`, `--gradient-primary`, `--gradient-surface`

- Radius: `--radius: 1rem` (rounded-2xl default)
- Font pairing: Inter Tight (display) + Inter (body) via Google Fonts in `__root.tsx`

All component colors must reference semantic tokens — no hard-coded hex.

## Tech & libraries

- TanStack Start file-based routes under `src/routes/`
- Tailwind v4 (existing setup)
- `framer-motion` for page transitions, card hovers, scan animation
- `lucide-react` for icons
- `recharts` for analytics charts (already common in shadcn)
- shadcn components already present: card, button, input, tabs, badge, switch, sidebar, table, progress, skeleton, sonner, dropdown-menu, avatar, dialog

Install if missing: `framer-motion`, `recharts`.

## Routes (file structure)

```
src/routes/
  __root.tsx                 -> shell: sidebar + topbar + <Outlet/>
  index.tsx                  -> Dashboard
  scan.tsx                   -> Scan Card
  review.tsx                 -> Review Screen
  contacts.tsx               -> Contacts
  queue.tsx                  -> Queue Center
  analytics.tsx              -> Analytics
  settings.tsx               -> Settings
```

Each route defines its own `head()` with unique title + description + og tags.

## Shell (in `__root.tsx` via a layout component)

- `SidebarProvider` wrapping `<AppSidebar />` + main column
- AppSidebar: floating glass card style (`backdrop-blur`, subtle border, rounded-2xl, `m-3`), collapsible="icon"
  - Brand row: gradient indigo logo mark + "CardSync AI"
  - Sections: Dashboard, Scan Card, Contacts, Queue Center, Analytics, Settings (lucide icons: LayoutDashboard, ScanLine, Users, Inbox, BarChart3, Settings)
  - Active state via `useRouterState` + `isActive`
  - Bottom: user profile card (avatar + name + role + chevron menu)
- TopBar: hamburger (mobile via `SidebarTrigger`), connection status pill (green dot "Online" / amber "Offline"), sync badge ("Synced 2m ago"), Bell icon w/ dot, avatar dropdown
- Subtle radial gradient background on main area

## Page-by-page

### 1. Dashboard (`/`)

Bento grid (CSS grid, asymmetric):

- Hero greeting card (col-span-2): "Good morning, Alex" + sub + primary "Scan a card" CTA
- 4 KPI cards: Total Contacts, Pending Queue, Messages Sent, Sync Success Rate (icon, value, trend chip with up/down)
- Recent Scans panel: list of 5 mock cards with avatar initials, name, company, status badge
- Queue Activity timeline (vertical with colored dots)
- Network Status card with signal animation
- Install PWA banner (dismissible, gradient border)

### 2. Scan Card (`/scan`)

- Large dropzone card (dashed border, rounded-2xl, hover lift)
  - Upload Image / Use Camera buttons
- Animated scan frame: simulated business card with moving gradient scan line (framer-motion `animate` y loop), corner brackets, glow
- Status row: "AI extracts contact details automatically" + offline queue indicator
- Recent scanned previews horizontal scroll

### 3. Review (`/review`)

- Two-column (stack on mobile):
  - Left: business card preview image + OCR confidence chips per field (e.g. Name 98%)
  - Right: editable form (Full Name, Company, Job Title, Phone, Email, Website, Address)
- Duplicate detection alert (amber, soft)
- Queue status info card
- WhatsApp + Email send toggles with status icons
- Sticky action bar: Save / Save & Send (gradient primary)

### 4. Contacts (`/contacts`)

- Header with search input (icon left) + sync button
- Filter tabs: All / Synced / Pending / Failed (counts)
- Responsive: table on desktop, cards on mobile
  - Avatar, name, company, job, status pill, channel icons (WhatsApp green, Mail), last synced
- Pagination footer
- Empty state SVG illustration component (custom inline SVG)
- Floating action button (sync) bottom-right

### 5. Queue Center (`/queue`) — flagship page

- Top stats row: Queue Health %, In Queue, Synced Today, Failed
- Status flow visualization: horizontal pipeline `Scanned → Queued → Synced → Message Sent` with animated pulse on active stage and counts per stage
- Two-column:
  - Sync Timeline (live activity feed with motion items entering)
  - Pending Uploads list with progress bars
- Failed Retry section with retry buttons
- Last synced timestamp + manual sync CTA
- Subtle gradient accents to make it feel "advanced"

### 6. Analytics (`/analytics`)

- 4 metric cards
- Charts (recharts):
  - Area chart: Scan Trends (last 30 days)
  - Bar chart: Queue Performance
  - Line chart: Contact Growth
  - Donut: Delivery Success (WhatsApp/Email/Failed)
- Clean card containers with title + subtitle + chart

### 7. Settings (`/settings`)

- Sectioned cards:
  - Profile (avatar, name, email, role)
  - Appearance (Dark mode toggle — wire to `document.documentElement.classList`)
  - Notifications (switches)
  - Integrations: WhatsApp + Email status rows with "Connected" badges
  - Danger zone

## Shared pieces (`src/components/`)

- `app-sidebar.tsx`
- `top-bar.tsx`
- `layout.tsx` (shell composition used by `__root.tsx`)
- `kpi-card.tsx`
- `status-pill.tsx`
- `scan-frame.tsx` (animated)
- `queue-pipeline.tsx`
- `empty-state.tsx`
- `mock-data.ts` (contacts, queue items, chart data)

## Animations & polish

- Page transitions: framer-motion fade+slide on `<Outlet/>` keyed by pathname
- Card hover: subtle translateY + shadow
- Skeletons on initial mount (300ms simulated)
- `sonner` toasts for sync actions
- Reduced-motion respected

## Out of scope (per user)

- No backend / Lovable Cloud
- No actual OCR or camera wiring — visual only
- No instructional/explanatory copy on how the app works

## Technical notes

- All colors via tokens; no raw hex in JSX
- Each route file: `createFileRoute(path)({ head, component })`
- Sidebar wrapper div uses `w-full` (per shadcn-sidebar guidance)
- Dark mode toggles `.dark` on `<html>` and persists to `localStorage`
- `defaultPreload: "intent"` already set in router