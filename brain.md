# PROPNEX AI — SYSTEM BRAIN & ARCHITECTURE MEMORY (`brain.md`)

> **CONFIDENTIAL & INTERNAL DEVELOPER MEMORY**  
> **Status:** Fully Analyzed & Verified against Live Hostinger VPS (`200.234.34.240`)  
> **Rule of Engagement:** This file serves as the single source of truth for the entire PropNex AI ecosystem. **Never modify production code or push to GitHub without cross-referencing this memory.**  
> **CRITICAL PRODUCTION RULE:** **NEVER TOUCH OR PUSH `.env` FILES TO HOSTINGER.** Hostinger server `.env` and `.env.local` files must remain completely untouched. Any environment variable changes must only be managed via GitHub repository secrets / environment settings. All deployments must proceed exclusively through GitHub Actions (`deploy.yml`) on `git push origin main`. No manual SSH or Python scripts to modify server environment or files.

---

## 1. Executive Summary & Ecosystem Overview

The PropNex AI platform is an enterprise-grade, multi-tenant AI Telephony, Workspace & Campaign Management SaaS. The system operates across **four primary codebases**, a self-hosted MongoDB replica set, a Redis cluster, Nginx reverse proxy with SSL termination, and a centralized Google Apps Script webhook integration for transactional email delivery and file storage.

### The 4 Core Codebases & System Roles
| Repository | Official GitHub Remote | Technology Stack | VPS Directory | PM2 Service | Internal Port | Public URL / Route |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`propnex-voice-web`** | [`propnexaiofficial-glitch/propnex-voice-web`](https://github.com/propnexaiofficial-glitch/propnex-voice-web) | Next.js 16 (React 19), TailwindCSS v4, Prisma | `/root/propnex-voice-web` | `propnexai-frontend` (id 0) | `3000` | `https://propnexai.com`, `https://www.propnexai.com`, `https://jinni360.com`, `https://cname.propnexai.com` |
| **`propnexai-main-server`** | [`propnexaiofficial-glitch/propnexai-main-server`](https://github.com/propnexaiofficial-glitch/propnexai-main-server) | NestJS 11, GraphQL Yoga, Prisma, BullMQ | `/root/propnexai-main-server` | `propnexai-main-server` (id 1) | `3002` | `https://api.propnexai.com/api/campaign-execution/`, `/api/webhooks/` |
| **`propnexai-admin-panel`** | [`propnexaiofficial-glitch/propnexai-admin-panel`](https://github.com/propnexaiofficial-glitch/propnexai-admin-panel) | Next.js 16 (React 19), Prisma, Iron Session | `/root/propnexai-admin-panel` | `propnex-admin-panel` (id 3) | `3003` | `https://admin.propnexai.com` |
| **`propnex-server`** | [`propnexaiofficial-glitch/propnex-server`](https://github.com/propnexaiofficial-glitch/propnex-server) | NestJS 11, Mongoose, Swagger | `/root/propnex-server` | `propnex-server` (id 2) | `5000` | `https://api.propnexai.com/` (REST API & Swagger docs) |

### Master Google Apps Script Location
- **Local Master Source File:**  
  `C:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\Info\Documents\apps_script_emails.js`
- **Admin Panel Synced File:**  
  `C:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnexai-admin-panel\google_apps_script.js`
- **Live Webhook Endpoint:**  
  `https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec`

---

## 2. Infrastructure Architecture & Hostinger VPS Specs

### VPS Specification
- **Provider:** Hostinger KVM 1 VPS
- **Hostname:** `srv1898501.hstgr.cloud`
- **Operating System:** Ubuntu 24.04 LTS (Kernel 6.8.0-xx-generic)
- **Primary IPv4:** `200.234.34.240`
- **SSH Access:** `ssh root@200.234.34.240`
- **SSH Username:** `root`
- **SSH Password:** `Propnexai@123`
- **hPanel Dashboard:** `https://hpanel.hostinger.com/vps/1898501/overview`

### Live Port Allocation Matrix on VPS
```
+---------------+------------------------+--------------------------+-------------------------------------+
| Port          | Service                | Bound Interface          | Nginx Upstream / Function           |
+---------------+------------------------+--------------------------+-------------------------------------+
| 22            | sshd                   | 0.0.0.0 & :::            | Remote Administration               |
| 80            | Nginx                  | 0.0.0.0                  | HTTP -> HTTPS 301 Redirect          |
| 443           | Nginx                  | 0.0.0.0                  | SSL / TLS Termination               |
| 3000          | Next.js Frontend       | 0.0.0.0 / localhost      | Main User Dashboard (propnexai.com) |
| 3002          | NestJS Main Server     | 0.0.0.0 / localhost      | Webhooks & Campaign Execution       |
| 3003          | Next.js Admin Panel    | 0.0.0.0 / localhost      | Admin Dashboard (admin.propnexai)   |
| 5000          | NestJS Propnex Server  | 0.0.0.0 / localhost      | General REST API (api.propnexai)    |
| 6379          | Redis Server           | 0.0.0.0                  | BullMQ Queues, Sessions, Caching    |
| 27017         | MongoDB (mongod)       | 0.0.0.0                  | Primary Database (ReplicaSet rs0)   |
+---------------+------------------------+--------------------------+-------------------------------------+
```

### System Architecture Diagram
```mermaid
flowchart TD
    subgraph Clients["Internet / Clients"]
        U["Web Users & Clients"]
        A["Platform Admins"]
        T["Telephony / PBX (BonVoice / VoiceNSMS)"]
        W["White Label Domains (jinni360.com / CNAME)"]
    end

    subgraph NginxReverseProxy["Nginx Reverse Proxy & SSL (Port 80/443)"]
        NX1["propnexai.com / www / CNAME\n-> http://localhost:3000"]
        NX2["admin.propnexai.com\n-> http://localhost:3003"]
        NX3["api.propnexai.com/api/...\n-> http://localhost:3002"]
        NX4["api.propnexai.com/\n-> http://localhost:5000"]
    end

    subgraph HostingerVPS["Hostinger VPS (200.234.34.240)"]
        subgraph PM2["PM2 Runtime (pm2-root.service)"]
            P0["propnexai-frontend (Port 3000)"]
            P1["propnexai-main-server (Port 3002)"]
            P2["propnex-server (Port 5000)"]
            P3["propnex-admin-panel (Port 3003)"]
        end

        subgraph Databases["Local Data Stores"]
            MDB[("MongoDB 7.x (ReplicaSet rs0)\nPort 27017\nUser: propnex_admin")]
            RDS[("Redis Server\nPort 6379\nAuth: Propnexai@123")]
        end
    end

    subgraph ExternalServices["External Cloud Integrations"]
        GAS["Google Apps Script Webhook\nEmails, Drive Uploads, 1 PM Cron"]
        BV["BonVoice / VoiceNSMS\nTelephony SIP & OBD API"]
    end

    U --> NX1 --> P0
    W --> NX1
    A --> NX2 --> P3
    T --> NX3 --> P1
    U --> NX4 --> P2

    P0 --> MDB
    P0 --> RDS
    P0 --> GAS
    P1 --> MDB
    P1 --> RDS
    P1 --> GAS
    P1 --> BV
    P3 --> MDB
    P3 --> RDS
    P3 --> GAS
    P2 --> MDB
    P2 --> RDS
```

---

## 3. The 4 GitHub Repositories & CI/CD Pipelines

Each repository has an active `.github/workflows/deploy.yml` pipeline configured to automatically deploy on pushes to `main`.

### 1. `propnex-voice-web`
- **GitHub Remote:** `https://github.com/propnexaiofficial-glitch/propnex-voice-web`
- **Local Path:** `c:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnex-voice-web`
- **VPS Target:** `/root/propnex-voice-web` (PM2: `propnexai-frontend` on Port `3000`)
- **Key Modules:**
  - Next.js 16 App Router (`app/(dashboard)`, `app/(auth)`, `app/api`)
  - Authentication & RBAC via JWT and Iron Session
  - Credit management, billing, and balance deduction ledger
  - Inbound & outbound campaign creation and dialer interfaces
  - White-label portal (`jinni360.com`, CNAME custom domains)
- **CI/CD Pipeline (`deploy.yml`):**
  - Triggers on push to `main`.
  - Builds Next.js bundle with `NODE_OPTIONS="--max_old_space_size=6144"`.
  - SCPs `.next`, `public`, `package.json`, `prisma` to VPS.
  - Runs `npm install --production` and reloads PM2 `propnexai-frontend`.

### 2. `propnexai-admin-panel`
- **GitHub Remote:** `https://github.com/propnexaiofficial-glitch/propnexai-admin-panel`
- **Local Path:** `c:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnexai-admin-panel`
- **VPS Target:** `/root/propnexai-admin-panel` (PM2: `propnex-admin-panel` on Port `3003`)
- **Key Modules:**
  - Master Platform Administration (`/admin`, `/companies`, `/numbers`, `/infra-costs`, `/white-label`)
  - **Infrastructure Costs Engine (`/infra-costs`):**
    - Anchored to **1:00 PM IST** (`13:00`) for start date and end date scheduling.
    - Same-day notifications dispatch reminders immediately upon creation.
    - End date triggers final reminder (`isDueToday: true`); never auto-marks paid.
    - **"Payment Done"** (Emerald Button): Confirms payment, dispatches `infra_cost_payment_completed` email, shifts forward to next monthly cycle or marks completed.
    - **"Payment Not Done"** (Amber Button via `/api/infra-costs/[id]/remind`): Re-sends reminder email immediately on demand; button remains active for repeated reminders.
  - Company approval queue, virtual number assignments, and 2FA authentication challenge.
- **CI/CD Pipeline (`deploy.yml`):**
  - Triggers on push to `main`.
  - Builds Next.js bundle via `npm run build`.
  - SCPs `.next`, `public`, `package.json`, `prisma` to VPS.
  - Runs `pm2 restart propnex-admin-panel --update-env`.

### 3. `propnexai-main-server`
- **GitHub Remote:** `https://github.com/propnexaiofficial-glitch/propnexai-main-server`
- **Local Path:** `c:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnexai-main-server`
- **VPS Target:** `/root/propnexai-main-server` (PM2: `propnexai-main-server` on Port `3002`)
- **Key Modules:**
  - NestJS 11 backend engine with GraphQL Yoga and BullMQ background queues.
  - Outbound OBD Campaign Execution (`/api/campaign-execution/`) with BonVoice & VoiceNSMS integration.
  - Telephony webhooks (`/api/webhooks/obd`, `/api/webhooks/bonvoice`).
  - Credit consumption engine and automated account pause triggers.
- **CI/CD Pipeline (`deploy.yml`):**
  - Triggers on push to `main`.
  - Builds NestJS distribution with `prisma generate` and `tsc-alias`.
  - Packages `deploy.tar.gz` and copies to `/root/propnexai-main-server`.
  - Unpacks, runs `npm ci --omit=dev`, and reloads PM2 `propnexai-main-server`.

### 4. `propnex-server`
- **GitHub Remote:** `https://github.com/propnexaiofficial-glitch/propnex-server`
- **Local Path:** `c:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnex-server`
- **VPS Target:** `/root/propnex-server` (PM2: `propnex-server` on Port `5000`)
- **Key Modules:**
  - NestJS 11 REST API engine with Mongoose and Swagger documentation (`/api/docs`).
  - Workspace management, CRM lead sync, and integration endpoints.
- **CI/CD Pipeline (`deploy.yml`):**
  - Triggers on push to `main` or `master`.
  - Builds via `npm run build`.
  - SCPs `dist`, `package.json` to `/root/propnex-server`.
  - Runs `pm2 restart propnex-server`.

### Required GitHub Repository Secrets & Automated Deployment Rules
> [!IMPORTANT]
> **CRITICAL DEPLOYMENT & WORKFLOW RULES:**
> 1. **PUSH TO GITHUB ONLY — NO HOSTINGER SSH / PYTHON SCRIPTS:**
>    - NEVER connect to Hostinger VPS via SSH or Python scripts to push code, build, or restart services.
>    - Simply commit and push code changes directly to GitHub `origin main`. GitHub Actions (`deploy.yml`) handles everything automatically.
> 2. **NEVER TOUCH OR PUSH `.env` FILES TO HOSTINGER:**
>    - Hostinger server `.env` and `.env.local` must remain completely untouched.
>    - Any environment variable changes must only be managed via GitHub repository secrets / environment settings.
> 3. **TARGETED MINIMAL CHANGES ONLY:**
>    - NEVER rewrite entire files or perform massive sweeping changes.
>    - Make only the exact, minimal code changes necessary to fix the specific problem reported.
> 4. **USER VERIFICATION:**
>    - Once changes are pushed to GitHub, do not run external verification or polling scripts. The user will test and verify manually on the live site.

To keep CI/CD working seamlessly across all repositories, these secrets must remain populated:
1. `HOSTINGER_HOST`: `200.234.34.240`
2. `HOSTINGER_USERNAME`: `root`
3. `HOSTINGER_PASSWORD`: `Propnexai@123`
4. `DATABASE_URL` (in `propnexai-main-server` repo):  
   `mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0`

---

## 4. Environment Variables & Cross-Linking Matrix

Every component relies on consistent secrets and connection strings. **Notice the URL encoding (`%40` for `@`)** required in MongoDB and Redis passwords!

### 1. `propnex-voice-web` (`/root/propnex-voice-web/.env.local`)
```ini
NEXT_PUBLIC_API_URL=https://api.propnexai.com
APPS_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec
DATABASE_URL=mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0
JWT_SECRET=propnex_secret_jwt_key_2026_key
REDIS_URL=redis://:Propnexai%40123@200.234.34.240:6379
NEXT_PUBLIC_ADMIN_URL=https://admin.propnexai.com
BONVOICE_USERNAME=PROP_NEXT
BONVOICE_PASSWORD=PRopne##xt89
BONVOICE_BASE_URL=https://backend.pbx.bonvoice.com
NEXT_PUBLIC_BASE_URL=https://propnexai.com
NEXT_PUBLIC_ADMIN_PASSWORD="Propnexai@123"
```

### 2. `propnexai-admin-panel` (`/root/propnexai-admin-panel/.env.local`)
```ini
NEXT_PUBLIC_API_URL=https://api.propnexai.com
ADMIN_USERNAME=PropnexAdmin
ADMIN_PASSWORD="PropnexAi@#2025"
JWT_SECRET=propnex_secret_jwt_key_2026_key
DATABASE_URL=mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0
ADMIN_SESSION_SECRET=propnex-admin-session-secret-change-in-production-min-32-chars
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec
REDIS_URL="redis://:Propnexai%40123@200.234.34.240:6379"
LOW_CREDIT_THRESHOLD=500
MAIN_SERVER_URL=http://200.234.34.240:3001
MEDIA_SERVER_PORT=3002
MEDIA_SERVER_URL=http://200.234.34.240:3001
```

### 3. `propnexai-main-server` (`/root/propnexai-main-server/.env`)
```ini
PORT=3002
NODE_ENV=development
MAIN_SERVER_URL=http://200.234.34.240:3001
MAIN_WEBSITE_URL=https://propnexai.com
DATABASE_URL="mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0"
REDIS_ENABLED=true
REDIS_URL="redis://:Propnexai%40123@200.234.34.240:6379"
JWT_SECRET=propnex_secret_jwt_key_2026_key
INBOUND_WEBHOOK_SECRET=H8i9J0k1L2
OBD_BASE_URL=https://obd.voicensms.in/obd/OBDAPI/webresources/CreateOBDCampaignPost
OBD_API_KEY=ZgoluYBmEwUZZp4CgDiCtXbC_aAXeMjuGg==
OBD_WEBHOOK_SECRET=H8i9J0k1L2
OBD_WEBHOOK_URL=http://200.234.34.240:3001/api/webhooks/obd
OBD_TIMEOUT_MS=30000
OBD_MAX_RETRIES=2
OBD_IVR_TEMPLATE_ID=179
OBD_RETRY_ATTEMPTS=0
OBD_RETRY_DURATION=15
OBD_SOURCE_TYPE=1
OBD_CAMPAIGN_TYPE=4
OBD_FILE_TYPE=2
OBD_SEND_NOW=1
OBD_USERNAME=PROP_NEXT
OBD_PASSWORD=PRopne##xt89
BONVOICE_USERNAME=PROP_NEXT
BONVOICE_PASSWORD=PRopne##xt89
GOOGLE_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec
VPS_PASSWORD="Propnexai@123"
```

### 4. `propnex-server` (`/root/propnex-server/.env`)
```ini
PORT=5000
DATABASE_CONNECTION_URL="mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0"
REDIS_URL="redis://:Propnexai@123@200.234.34.240:6379"
```

---

## 5. Google Apps Script Email Redirection & Notification System

### Master Script File Locations
- **Master Workspace File:**  
  `C:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\Info\Documents\apps_script_emails.js`
- **Admin Panel Synced File:**  
  `C:\Users\farhan khalid\OneDrive\Desktop\Documents\Propnex\propnexai-admin-panel\google_apps_script.js`

### Live Webhook Endpoint
**URL:**  
`https://script.google.com/macros/s/AKfycbz2zj_l7vcmiPZKuYqEVdso0apyW3aDJZZWTVTJ1jRrQr8PLGZIH_TzRpTLFskphIwgDQ/exec`

### Global Defaults in Script
- `GLOBAL_BRAND_NAME`: `"PropNex AI"`
- `GLOBAL_BRAND_EMAIL`: `"support@propnexai.com"`
- `GLOBAL_BRAND_PHONE`: `"+91 9889479110"`
- `ADMIN_EMAIL`: `"support@propnexai.com"`
- `DASHBOARD_URL`: `"https://www.propnexai.com/auth/sign-in"`
- `BILLING_URL`: `"https://www.propnexai.com/dashboard/billing"`
- `COMPANIES_URL`: `"https://www.propnexai.com/dashboard/companies"`
- `ADMIN_URL`: `"https://admin.propnexai.com/login"`
- `NEXT_APP_API_URL`: `"https://admin.propnexai.com/api/infra-costs"`

### Automated Infra Cost & Subscription Schedule (Daily 1:00 PM IST Cron & Interactive Actions)
- **Daily Cron Function:** `sendPaymentRemindersAt10AM()` / `sendPaymentRemindersAt1PM()`
- **Trigger Installation:** Run `setupDailyTrigger()` in Google Apps Script console (installs daily trigger at 1:00 PM IST / `atHour(13)`).
- **Daily Dispatch from Start Date to End Date (1:00 PM IST):**
  - E.g., Oct 10 to Oct 12: Runs every day (Oct 10, Oct 11, Oct 12) at 1:00 PM IST until admin marks payment complete or cycle ends.
  - **USER receives:** Payment reminder email (`infra_cost_reminder_user`). On the end date, it is flagged as the final payment reminder (`isDueToday: true`).
  - **ADMIN receives:** "Payment Not Done / Pending" alert email (`infra_cost_reminder_admin`) detailing the client's name, company, Gmail/email, billing period, and status: `❌ Payment Not Done / Pending`.
- **Immediate Dispatch for Same-Day Creation:**
  - If created on or after the start date, both Admin and User are notified immediately at the same time.
  - Future dates trigger starting at 1:00 PM IST on the scheduled start date.
- **Admin Actions in `/infra-costs` (User-Only Notifications):**
  - **"Payment Done"** (Emerald Button):
    - Shifts recurrence forward by cycle interval (preserving 1:00 PM IST) or marks completed if `ONCE`.
    - Dispatches `infra_cost_payment_completed` confirmation email **ONLY to the USER** (admin is not notified).
    - Current cycle buttons vanish and next cycle is scheduled.
  - **"Payment Not Done"** (Amber Button via `/api/infra-costs/[id]/remind`):
    - Re-sends payment reminder email (`infra_cost_reminder_user`) **ONLY to the USER** (admin is not notified).
    - Button **does NOT vanish**; admin can click repeatedly for follow-up reminders.

### Complete Email Event Dispatch Catalog
The script receives a JSON `POST` payload with a `type` parameter and dispatches styled HTML emails via `MailApp.sendEmail()` or saves files to Google Drive:

1. **Authentication & Security:**
   - `admin_2fa_otp`: 6-digit OTP sent to `ADMIN_EMAIL` with IP location and device info.
   - `vault_otp`: Math challenge problem sent to admin to unlock global User Vault.
   - `login_otp`: 6-digit login verification OTP sent to user.
   - `signup_otp`: 6-digit email verification OTP sent to new registrant.
   - `password_reset_otp`: Password reset OTP sent to user.
   - `password_changed_success`: Confirmation that user password changed successfully.

2. **User Onboarding & Lifecycle:**
   - `new_registration`: Notifies `ADMIN_EMAIL` of new sign-up and sends "Under Review" email to user.
   - `reminder_approval`: User in waiting room triggers a reminder to admin.
   - `company_created`: User account approved; workspace created; login link sent.
   - `user_rejected`: Rejection notice with policy note (re-apply after 6 months).
   - `user_deleted`: Account removal confirmation sent to user.

3. **Sub-Company Management:**
   - `SUB_COMPANY_CREATED` / `new_subcompany`: User creates subcompany; admin alerted to verify; user receives pending notice.
   - `subcompany_reminder`: Reminder to admin to verify subcompany.
   - `subcompany_approved`: Subcompany officially approved with allocated credits.
   - `subcompany_verified_numbers`: Subcompany verified with inbound and outbound phone numbers assigned.
   - `subcompany_deleted_by_user`: Deleted by user; credits returned to parent; admin notified.
   - `subcompany_deleted_by_admin`: Deleted by admin; user notified.

4. **Telephony & Phone Number Allocation:**
   - `reminder_number`: User reminders admin to assign inbound/outbound number.
   - `reminder_number_subcompany`: Subcompany phone number reminder to admin.
   - `number_assigned`: Phone number(s) assigned to workspace.
   - `number_assigned_subcompany`: Number(s) assigned to subcompany.
   - `number_added`: Additional number added alongside existing active numbers.
   - `number_removed`: Admin removes number from workspace/subcompany.

5. **Credits, Recharge & Billing:**
   - `credit_request`: User requests credit top-up (minimum 5,000) from billing dashboard -> admin alerted.
   - `credit_added`: Admin approves top-up -> user notified with `+amount` and updated balance.
   - `credit_rejected`: Admin declines top-up request.
   - `CREDIT_UPDATE` / `subcompany_credits_updated`: Credit balance adjusted between parent and child.
   - `credit_low_warning`: Main account credit running low alert.
   - `subcompany_credit_low`: Subcompany low credit balance alert.
   - `credit_zero_user` / `CREDIT_ZERO_WARNING`: Balance hits 0; services paused alert.
   - `credit_zero_admin`: Admin alert that a company has run out of credits.
   - `subcompany_credit_zero` / `SUBCOMPANY_CREDIT_ZERO_WARNING`: Subcompany balance hits 0.

6. **White Label Branding Workflow:**
   - `white_label_setup`: Email invitation with setup link and DNS Configuration Guide PDF link.
   - `white_label_otp`: Verification OTP for white-label form submission.
   - `white_label_received`: Confirmation to user and alert to `support@propnexai.com` with custom domain, logos, and company metadata.
   - `white_label_completed`: Final confirmation to user that custom domain is active and live.

7. **Audio File Uploads to Google Drive:**
   - `upload_agent_audio`: Decodes base64 MP3/WAV and saves to Drive Folder: `1QxV-wvvLRXKodYf6Teks6zk_ZCHBuJoB`.
   - `upload_agent_audio_multipart`: Multipart handler to bypass Apps Script V8 memory limits.

8. **Careers & Job Applications:**
   - `job_application`: Uploads candidate resume PDF directly to Google Drive Folder: `1HiUbSx25oXaMFF7gNbiLv0zx7s12xRn3`.
   - `job_accepted`: Candidate advance to next round notification.
   - `job_rejected`: Respectful rejection email.
   - `expired_jobs_removed`: Admin report of automatically purged expired job listings.

9. **Website Leads & Inquiries:**
   - `demo_call_submit`: Website live demo request form submission.
   - `partner_app_submit`: Website partner application submission.

---

## 6. Database Architecture & Collections Catalog

### MongoDB Instance Details
- **Engine:** MongoDB 7.x Community Server
- **Service:** `mongod.service` (Systemd enabled & active)
- **Mode:** Single-Node Replica Set (`rs0`)
- **Port:** `27017`
- **Database:** `propnex`
- **Auth Source:** `admin`
- **Connection URI:**  
  `mongodb://propnex_admin:Propnexai%40123@200.234.34.240:27017/propnex?authSource=admin&replicaSet=rs0`

### Key MongoDB Collections
- `Company` & `CompanyMember`: Multi-tenant workspace entities and RBAC.
- `User` & `Role`: Global authentication records and permission levels.
- `CreditBalance` & `CreditUsage`: Real-time ledger of inbound/outbound telephony credits.
- `PhoneNumber`: Inbound/outbound numbers attached to companies.
- `Campaign` & `CampaignExecution`: Dialing campaigns and real-time execution states.
- `UploadedContact` & `Lead`: Contact records and lead pipelines.
- `CallLog`, `CallTranscript` & `CallAnalysis`: Complete call logs, recordings, and post-call analysis.
- `InfraCostNotification`: Scheduled tenant cost reminders, cycles, and payment statuses.
- `WhiteLabelDomain`: Custom domain records, SSL status, and brand metadata.
- `SystemEvent` & `AuditLog`: System-wide audit trail.

---

## 7. Nginx Domain Routing & SSL Configuration

All domain routing is handled by Nginx on the Hostinger VPS (`200.234.34.240`) with Let's Encrypt SSL certificates.

### Domain to Upstream Map
```
https://propnexai.com       ───────> http://localhost:3000 (propnexai-frontend)
https://www.propnexai.com   ───────> http://localhost:3000 (propnexai-frontend)
https://jinni360.com        ───────> http://localhost:3000 (propnexai-frontend)
https://cname.propnexai.com ───────> http://localhost:3000 (White Label Gateway)
https://admin.propnexai.com ───────> http://localhost:3003 (propnex-admin-panel)
https://api.propnexai.com/api/campaign-execution/ ─> http://localhost:3002 (main-server)
https://api.propnexai.com/api/webhooks/           ─> http://localhost:3002 (main-server)
https://api.propnexai.com/                        ─> http://localhost:5000 (propnex-server)
```

---

## 8. Developer Guidelines & Safe Maintenance Rules

### 1. Zero-Downtime Rule
Never manually stop PM2 without ensuring the fallback is ready. Always use:
```bash
pm2 reload <app-name> --update-env
# or
pm2 restart <app-name> --update-env
```

### 2. Redis Password URL-Encoding
Whenever updating a `.env` file containing `REDIS_URL` or `DATABASE_URL`, the `@` symbol in the password (`Propnexai@123`) **MUST** be encoded as `%40`:
- **Correct:** `redis://:Propnexai%40123@200.234.34.240:6379`
- **Incorrect:** `redis://:Propnexai@123@200.234.34.240:6379` (causes connection parsing error)

### 3. Prisma Schema Synchronization
All three Prisma apps (`propnex-voice-web`, `propnexai-admin-panel`, and `propnexai-main-server`) use MongoDB with Prisma. If you modify a model in one schema:
1. Copy the modification to the other schemas to maintain schema parity.
2. Run `npx prisma generate` in each repository.
3. Push to `main` only after local TypeScript checks pass.

### 4. Google Apps Script Webhook URL Safety
Never change the webhook URL in `.env` without testing via the `RUN TEST.bat` suite or running a test payload to avoid breaking email deliveries for signups, 2FA OTPs, or subcompany approvals.

### 5. Memory Preservation
This file (`brain.md`) is the master system memory. When new features, routes, or services are added, document them here immediately so that all future coding tasks operate with complete and infallible context.

---

## 9. Authentication Security & Anti-Brute-Force Architecture

### Bucket Rate Limiting (Token Bucket / Sliding Window)
- **Rate Limit Threshold:** 5 attempts per 60 seconds per IP address AND per account email.
- **Defense Target:** Distributed bots, automated dictionary attacks, and credential stuffing.
- **Enforcement:** Applied on `/api/users/signin` and `/api/users/forgot-password`.
- **Response:** HTTP 429 Too Many Requests with explicit `Retry-After: <seconds>` header.

### Account Lockout & Mandatory OTP Reset Flow
- **Consecutive Wrong Password Limit:** 5 consecutive failed attempts.
- **Lockout Mechanism:** 
  1. Once `failedLoginAttempts >= 5`, account is flagged with `requirePasswordReset: true` and locked for 24 hours (`lockedUntil`).
  2. Further password login attempts are blocked immediately with HTTP 423.
  3. A 6-digit OTP is automatically generated and dispatched via the Google Apps Script webhook (`account_locked_otp`) to the user's email with high-priority security alert.
  4. User must verify OTP and set a new password via the reset password flow to unlock their account.
  5. Upon successful password reset, `failedLoginAttempts` is reset to 0 and lockout flags are cleared.
- **Timing Attack Immunity:** Non-existent emails run a dummy bcrypt compare against a pre-computed hash to keep response latency uniform.

### Strict Password Reuse Prevention
- In `/api/users/reset-password`, the proposed `newPassword` is compared against `user.passwordHash` using `bcrypt.compare`.
- If identical, the request is rejected with: *"New password cannot be the same as your previous password. Please choose a different password for security."*


### 6. Mandatory TypeScript Check Before Any Git Push (`tsc --noEmit`)
Before committing or pushing any updates to GitHub in any repository (`propnexai-admin-panel`, `propnex-voice-web`, `propnexai-main-server`, `propnex-server`), **ALWAYS** execute:
```bash
npx tsc --noEmit
```
Verify that the output contains 0 errors. Never push code that breaks TypeScript typechecking or causes build failures in CI/CD. Only proceed with `git commit` and `git push` once `npx tsc --noEmit` exits with status code 0.

### 7. NEVER TOUCH OR PUSH `.env` FILES TO HOSTINGER (MANDATORY POLICY)
- **Hostinger Server `.env` and `.env.local` Must Remain Completely Untouched**:
  - Under no circumstances should any developer, AI agent, or automated script modify, replace, overwrite, or push `.env` or `.env.local` files on the Hostinger VPS (`200.234.34.240`).
  - Production secrets and environment files on Hostinger are permanently managed in place and are completely hands-off.
- **Environment Variable Changes Managed ONLY in GitHub Secrets / Settings**:
  - Any new, modified, or rotated environment variables must exclusively be configured via GitHub repository secrets and environment variables.
  - Code must be authored to read from the existing server environment without attempting to upload new local `.env` files.
- **Strict Code-Only Deployment via GitHub Actions**:
  - The **ONLY** thing that should be deployed to Hostinger is clean code pushed to GitHub `origin main`.
  - GitHub Actions (`deploy.yml`) is the sole authorized deployment pathway. It automatically handles pulling and building the code on Hostinger.
  - **Zero Python/SSH Deployment Scripts**: Never use Python, paramiko, or manual SSH scripts to perform ad-hoc deployments, force-pushes, or git resets on Hostinger.
  - Workflows must always be:
    1. Make minimal, surgical code changes locally.
    2. Validate with `npx tsc --noEmit` (0 errors).
    3. `git commit` and `git push origin main`.
    4. Let GitHub Actions deploy automatically.

