# Personal Cloud Storage Platform (Self-Hosted NAS)
## Phase 2: Nextcloud Deployment, Database Bootstrap & Real WebDAV Integration

A self-hosted personal cloud storage platform powered by **Nextcloud** and **Docker**, paired with two custom web portals:
1. **Admin Storage Manager Portal** (Runs locally on host server at `http://localhost:3001`): Hardware storage detection (SSDs, USB HDDs, Flash drives), candidate storage selection, disk health alerts, and system telemetry.
2. **User Cloud Portal** (Deployable to **Render** or locally at `http://localhost:3002`): Clean, mobile-friendly cloud interface for photos, documents, folder organization, sharing, and previews.
3. **Core Backend Engine** (Runs at `http://localhost:4001/api`): Direct integration layer communicating with Nextcloud's WebDAV and OCS REST APIs.

---

## 1. System Architecture & Data Flow

```
                      [ USER CLIENTS ]
             (Mobile Browser, Laptop, Tablet)
                            |
                            v
       +-----------------------------------------+
       |   User Cloud Portal (Next.js - Port 3002)|
       |   - Real File Browser & Photo Gallery   |
       |   - Folder Creation & File Download     |
       |   - Abstracted User Quota Display       |
       +--------------------+--------------------+
                            |
                            v REST & Streaming Uploads
       +-----------------------------------------+
       |   Node.js Backend Engine (Port 4001)    |
       |   - Input Sanitization & Path Guard     |
       |   - Hardware Inspector (Safe lsblk)     |
       |   - Nextcloud OCS & WebDAV Bridge       |
       +--------------------+--------------------+
                            |
                            v WebDAV RFC 4918 / OCS v1
       +-----------------------------------------+
       |   Nextcloud Engine (Docker - Port 8080) |
       |   - WebDAV Server (/remote.php/dav)     |
       |   - User Quota & Permissions            |
       |   - Thumbnails & Version Control        |
       +--------------------+--------------------+
                            |
                            v
                [ Persistent Storage Volume ]
```

---

## 2. Acceptance Criteria & Integration Test Results (Phase 2)

All 13 integration and security acceptance tests have passed against real services:

| Component / Test Suite | Result | Details |
| :--- | :---: | :--- |
| **Docker Services Readiness** | **PASS** | Nextcloud, PostgreSQL, and Redis containers healthy |
| **Nextcloud Container Health** | **PASS** | Nextcloud v28.0.14.1 reported `installed: true`, `maintenance: false` |
| **Backend API Health** | **PASS** | `/health` endpoint returning `HTTP 200 OK` on port 4001 |
| **OCS User Provisioning** | **PASS** | Created dedicated user `phase2_tester` via Nextcloud OCS API |
| **WebDAV Directory Listing** | **PASS** | Real PROPFIND returning live directory hierarchy |
| **WebDAV Folder Operations** | **PASS** | Created nested folders `/Documents/Semester_Projects` |
| **Real File Upload** | **PASS** | Multipart upload streamed to Nextcloud via WebDAV PUT |
| **Real File Download & Integrity**| **PASS** | Byte-for-byte verification of downloaded test file |
| **WebDAV Rename / Move** | **PASS** | Relocated file using WebDAV MOVE |
| **WebDAV File Deletion** | **PASS** | Deleted item from Nextcloud using WebDAV DELETE |
| **Container Restart Persistence** | **PASS** | Files survived `docker restart nextcloud` on persistent volume |
| **Security: Path Traversal Blocked**| **PASS** | Requests with `../../` rejected with HTTP 404/400 |
| **Security: Empty Upload Rejected** | **PASS** | Empty file payload rejected with HTTP 400 |
| **Real User Quota Inspection** | **PASS** | Extracted real Nextcloud quota via OCS User API |

---

## 3. How to Run the System

### Step 1: Start Database, Cache & Nextcloud Containers
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

### Step 2: Start Backend Storage Engine
```bash
cd backend
npm run build
node dist/server.js
# Backend listening on http://localhost:4001/api
```

### Step 3: Start Admin Storage Portal
```bash
cd apps/admin-portal
npm run dev
# Admin Portal listening on http://localhost:3001
```

### Step 4: Start User Cloud Portal
```bash
cd apps/user-portal
npm run dev
# User Portal listening on http://localhost:3002
```

---

## 4. Port Allocation Summary

| Service | Port | Description |
| :--- | :--- | :--- |
| **Nextcloud WebDAV** | `8080` | Official Nextcloud 28 instance (`http://localhost:8080`) |
| **Backend API Engine**| `4001` | Express REST & WebSocket server (`http://localhost:4001/api`) |
| **Admin Storage Portal**| `3001` | Storage Hardware & Telemetry Dashboard (`http://localhost:3001`) |
| **User Cloud Portal** | `3002` | User Cloud Files & Gallery Portal (`http://localhost:3002`) |
| **PostgreSQL Database**| `5432` | Application & Nextcloud databases |
| **Redis Cache** | `6379` | In-memory session and cache store |

---

## 5. Storage Safety Guarantees (Phase 2)
- **No Automatic Formatting:** Storage devices detected on the host are displayed to the administrator as candidates only. No disk formatting or partition deletion is ever run automatically.
- **Path Traversal Protection:** All WebDAV file paths are sanitized to reject null bytes, directory traversal patterns (`../`), or root filesystem escapes.
- **Physical vs. Quota Separation:** Physical disk capacity (reported by host OS) is strictly separated from individual user cloud quotas (reported by Nextcloud).
- **Mergerfs Isolation:** Production `mergerfs` union mount modification is deferred until Phase 3 to ensure Nextcloud file operations remain completely stable.

---

## 6. Known Limitations
1. **Simulated Block Devices on Non-Linux Hosts:** On macOS and Windows developer machines without Linux `/dev` block devices, storage discovery uses a realistic host simulation mode (`SIMULATE_STORAGE=true`). On Linux and Raspberry Pi, `lsblk` is invoked directly.
2. **Nextcloud Internal Direct Writes:** Nextcloud tracks files in its own internal cache. All file uploads, deletions, and folder creations must flow through the WebDAV API (as implemented) rather than raw filesystem writes to prevent cache desynchronization.
