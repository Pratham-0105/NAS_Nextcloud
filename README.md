# Personal Cloud Storage Platform (Self-Hosted NAS)

A self-hosted personal cloud storage platform powered by **Nextcloud** and **Docker**, paired with two specialized custom portals:
1. **Admin Storage Manager Portal** (Runs locally on host): Hardware storage detection (SSDs, USB HDDs, Flash drives), `mergerfs` storage pooling, disk health alerts, and system telemetry.
2. **User Cloud Portal** (Deployable to **Render** or locally): Clean, mobile-friendly cloud interface for photos, documents, folder organization, sharing, and previews.
3. **Core Backend Engine**: Bridges host hardware with Nextcloud's WebDAV and OCS REST APIs.

---

## Architecture Overview

```
                      [ PUBLIC INTERNET ]
                               |
                               v
               +-------------------------------+
               |   Render.com (or Local Host)  |
               |       User Cloud Portal       |
               +---------------+---------------+
                               |
                               v (Cloudflare Tunnel / HTTPS)
        +----------------------------------------------+
        |            LOCAL SERVER (Host Machine)       |
        |                                              |
        |  +----------------------------------------+  |
        |  | Docker Environment                     |  |
        |  |  - Node.js Backend API                 |  |
        |  |  - Nextcloud 28+ (File/WebDAV Engine)  |  |
        |  |  - PostgreSQL 16 (App & NC DBs)        |  |
        |  |  - Redis 7 (Cache / Real-time PubSub)  |  |
        |  |  - Admin Storage Portal (Port 3001)    |  |
        |  +-------------------+--------------------+  |
        |                      |                       |
        |                      v                       |
        |           /mnt/storage_pool (mergerfs)       |
        |            /         |         \             |
        |       Internal     External   USB Flash      |
        |         SSD        USB HDD      Drive        |
        +----------------------------------------------+
```

---

## Directory Structure

```
├── backend/                  # Node.js + Express + TypeScript + Prisma API
│   ├── prisma/schema.prisma  # PostgreSQL Schema (Devices, Users, Events)
│   └── src/                  # Controllers, Services (StorageDetector, Nextcloud API)
├── apps/
│   ├── admin-portal/         # Next.js 14 Admin & Storage Hardware Management Portal
│   └── user-portal/          # Next.js 14 Mobile-Ready User Cloud Portal (Render-ready)
├── docker/
│   ├── docker-compose.yml    # Full local production stack
│   ├── docker-compose.dev.yml# Lightweight dev environment
│   └── init-db.sql           # Multi-database PostgreSQL initialization
└── docs/                     # Guides for Linux mounting, mergerfs, and Render deployment
```

---

## Quick Start (Local Development)

### 1. Requirements
- Node.js 18+ (tested on v20 & v22)
- Docker Desktop or Docker Engine + Docker Compose

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Start Database & Core Services
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

### 4. Install & Run Backend
```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
```

### 5. Install & Run Portals
```bash
# Admin Portal (Port 3001)
cd apps/admin-portal
npm install
npm run dev

# User Portal (Port 3002)
cd apps/user-portal
npm install
npm run dev
```
