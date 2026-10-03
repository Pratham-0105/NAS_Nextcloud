# Deploying User Cloud Portal to Render.com & Connecting to Local Server

This guide explains how to host your **User Cloud Portal on Render.com** while your physical storage server and Nextcloud run securely on your local PC or laptop.

---

## 1. How It Works

```
  [ Phone or Laptop Anywhere ]
               |
               v
  [ Render.com: User Cloud Portal ]
               |
               v HTTPS (Cloudflare Tunnel)
  [ Local PC / Laptop / Raspberry Pi ]
       - Nextcloud (WebDAV)
       - Node.js Backend API
       - Physical Storage Pool (mergerfs)
```

No public static IP or router port forwarding is needed! The free Cloudflare Tunnel creates a zero-trust encrypted tunnel directly between your home machine and Cloudflare's edge network.

---

## 2. Step 1: Start Your Local Storage Backend & Nextcloud

On your local machine (Mac or Linux PC):

```bash
# 1. Start database, cache & Nextcloud
docker compose -f docker/docker-compose.dev.yml up -d

# 2. Run backend storage engine
cd backend
npm run dev
```

Your local backend is now running at `http://localhost:4001`.

---

## 3. Step 2: Expose Local Backend with Free Cloudflare Tunnel

Install `cloudflared` (available on macOS, Linux, and Raspberry Pi):

```bash
# On macOS:
brew install cloudflared

# On Linux / Raspberry Pi:
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

Run a quick temporary tunnel without even needing a domain:
```bash
cloudflared tunnel --url http://localhost:4001
```

Cloudflare will output a public HTTPS address like:
```
https://random-words-1234.trycloudflare.com
```

---

## 4. Step 3: Deploy to Render.com

1. Push your repository to GitHub or GitLab.
2. Log into [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Select your repository.
4. Set the Root Directory to: `apps/user-portal`
5. Set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
6. In **Environment Variables**, add:
   ```env
   NEXT_PUBLIC_API_URL=https://random-words-1234.trycloudflare.com/api
   ```
7. Click **Deploy Web Service**.

---

## 5. Result

You will receive a public URL such as `https://personal-cloud-portal.onrender.com`.
When you open this on your phone or tablet, you can upload photos, browse your documents, and all files will be safely stored onto your physical drives at home!
