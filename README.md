# 🍽️ Open Kitchens — See What You Eat

> India's first cloud kitchen with **live kitchen streaming** — watch your food being prepared in real-time, from order placement to doorstep delivery.

![Open Kitchens Logo](public/images/logo.png)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Deployment Guide](#deployment-guide)
  - [Option 1: Railway (Recommended)](#option-1-railway-recommended)
  - [Option 2: Render](#option-2-render)
  - [Option 3: AWS EC2 / DigitalOcean Droplet](#option-3-aws-ec2--digitalocean-droplet)
  - [Option 4: Docker](#option-4-docker)
  - [Option 5: Vercel (Static + Serverless)](#option-5-vercel-static--serverless)
- [Environment Variables](#environment-variables)
- [Portals](#portals)
- [Menu Data](#menu-data)
- [Roadmap](#roadmap)

---

## Overview

**Open Kitchens** is a cloud kitchen PWA (Progressive Web App) built for Bengaluru, offering:

- 🎥 Live RTSP kitchen video streaming per order
- 🗺️ Real-time rider GPS tracking
- 🍽️ 64-item authentic home-style Indian menu
- 📱 Three dedicated portals: Customer · Restaurant · Rider
- 💳 Razorpay-ready payment integration (UPI, Card, COD)

**Service area:** ~8–10 km radius from Hebbal, Bengaluru (560024)

---

## Features

| Module | Features |
|---|---|
| **Customer App** | Pincode-based delivery check, menu browse & search, veg/non-veg filter, cart management, coupon codes, checkout, live order tracking, kitchen video stream, rider tracking map, order rating |
| **Restaurant Portal** | Order accept/reject/manage, live prep timer, menu item toggle (available/unavailable), RTSP stream configuration, rider fleet view |
| **Rider Portal** | Online/offline toggle, active delivery navigation, delivery history, earnings tracker, rider registration |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ |
| **Server** | Express.js 4.x |
| **Frontend** | Vanilla HTML5 / CSS3 / JavaScript (ES6+) |
| **Styling** | Custom CSS with brand design tokens |
| **Data** | Menu data embedded as JS module (from Excel source) |
| **Logging** | JSON structured logs via `fs.appendFileSync` |
| **Process** | `nohup` / PM2 for production |

> **Architecture Decision:** Per ADR-20260323-R-001, the production roadmap targets **Next.js 14 (App Router)** + React as the frontend framework. This prototype uses vanilla HTML/CSS/JS for rapid deployment — it is designed to be migrated to Next.js in the next sprint.

---

## Project Structure

```
open-kitchens/
├── server.js                 # Express server + API endpoints
├── package.json
├── public/
│   ├── index.html            # Customer landing page
│   ├── menu.html             # Full menu with cart
│   ├── checkout.html         # Checkout & payment
│   ├── tracking.html         # Order tracking + live stream
│   ├── restaurant.html       # Restaurant management portal
│   ├── rider.html            # Delivery partner portal
│   ├── css/
│   │   └── app.css           # Brand design system & all styles
│   ├── js/
│   │   └── menu-data.js      # 64-item menu data + cart logic
│   └── images/
│       └── logo.png          # Open Kitchens brand logo
└── logs/
    └── app.log               # JSON structured application logs
```

---

## Local Development

### Prerequisites

- **Node.js** v18 or higher — [Download](https://nodejs.org)
- **npm** v9 or higher (comes with Node.js)
- **Git**

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Octaves0911/open-kitchens.git
cd open-kitchens

# 2. Install dependencies
npm install

# 3. Start the development server
npm start

# 4. Open in browser
# http://localhost:3000
```

The app will be available at:

| URL | Page |
|---|---|
| `http://localhost:3000` | Customer Landing Page |
| `http://localhost:3000/menu` | Full Menu |
| `http://localhost:3000/checkout` | Checkout |
| `http://localhost:3000/tracking` | Order Tracking |
| `http://localhost:3000/restaurant` | Restaurant Portal |
| `http://localhost:3000/rider` | Rider Portal |
| `http://localhost:3000/health` | Health Check (JSON) |

---

## Deployment Guide

### Option 1: Railway (Recommended)

Railway is the fastest zero-config deployment for Node.js apps.

**Steps:**

1. **Create a Railway account** at [railway.app](https://railway.app)

2. **Connect GitHub:**
   - Click **New Project** → **Deploy from GitHub repo**
   - Select `Octaves0911/open-kitchens`
   - Railway auto-detects Node.js and runs `npm start`

3. **Configure the port** (Railway uses `$PORT` automatically):
   - The server already reads `process.env.PORT || 3000` ✅

4. **Set environment variables** (optional for prototype):
   - Go to **Variables** tab in Railway dashboard
   - Add any variables from the [Environment Variables](#environment-variables) section

5. **Deploy:**
   - Railway builds and deploys automatically on every push to `main`
   - Your app will be live at `https://open-kitchens-production.up.railway.app` (or similar)

**Cost:** Free tier includes 500 hours/month — sufficient for prototype demos.

---

### Option 2: Render

1. **Create account** at [render.com](https://render.com)

2. **New Web Service:**
   - Click **New** → **Web Service**
   - Connect GitHub → select `open-kitchens` repo
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node

3. **Select plan:** Free (spins down after 15 mins inactivity) or Starter ($7/mo for always-on)

4. **Deploy** — Render provides a URL like `https://open-kitchens.onrender.com`

---

### Option 3: AWS EC2 / DigitalOcean Droplet

For production-grade deployment on a VPS:

#### a) Provision server
- **AWS EC2:** `t3.micro` (Free Tier eligible) — Ubuntu 22.04 LTS
- **DigitalOcean:** $6/mo Droplet — Ubuntu 22.04

#### b) SSH into your server
```bash
ssh ubuntu@YOUR_SERVER_IP
```

#### c) Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should show v18.x
```

#### d) Install PM2 (process manager)
```bash
sudo npm install -g pm2
```

#### e) Clone and setup the app
```bash
# Clone the repo
git clone https://github.com/Octaves0911/open-kitchens.git
cd open-kitchens

# Install dependencies
npm install

# Start with PM2 (keeps app alive on restart)
pm2 start server.js --name "open-kitchens"
pm2 startup    # auto-start on reboot
pm2 save
```

#### f) Configure Nginx reverse proxy
```bash
sudo apt-get install -y nginx

sudo nano /etc/nginx/sites-available/open-kitchens
```

Paste the following Nginx config:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/open-kitchens /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### g) Enable HTTPS with Certbot (SSL)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Follow prompts — auto-renews every 90 days
```

#### h) Open firewall ports
```bash
# AWS: Add inbound rules in Security Group for ports 80, 443
# DigitalOcean:
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Your app is now live at `https://yourdomain.com` 🎉

---

### Option 4: Docker

#### a) Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

#### b) Create `.dockerignore`:
```
node_modules
logs
*.log
.git
```

#### c) Build and run:
```bash
# Build image
docker build -t open-kitchens .

# Run container
docker run -d -p 80:3000 --name open-kitchens open-kitchens

# Check logs
docker logs open-kitchens
```

#### d) Deploy to any cloud with Docker support:
- **AWS ECS / Fargate** — push to ECR and create a service
- **Google Cloud Run** — `gcloud run deploy`
- **Azure Container Apps** — `az containerapp create`
- **Fly.io** — `fly launch` then `fly deploy`

---

### Option 5: Vercel (Static + Serverless)

Since the app is mostly static with a lightweight Express server:

1. Install Vercel CLI: `npm i -g vercel`

2. Create `vercel.json` in project root:
```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/server.js" }]
}
```

3. Deploy:
```bash
vercel --prod
```

---

## Environment Variables

Create a `.env` file in the project root for production configuration:

```env
# Server
PORT=3000
NODE_ENV=production

# App Configuration
APP_NAME=Open Kitchens
APP_VERSION=1.0.0

# Future: Razorpay Payment Gateway
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_here

# Future: Database (MongoDB Atlas / PostgreSQL)
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/openkitchens

# Future: RTSP / Stream Configuration
RTSP_SERVER_URL=rtsp://your.camera.ip:554/stream
HLS_OUTPUT_DIR=/tmp/hls

# Future: JWT Auth
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRY=7d

# Future: Twilio OTP
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1xxxxxxxxxx

# Future: AWS S3 (food images)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET=open-kitchens-media
```

> **⚠️ Never commit `.env` to Git.** Add it to `.gitignore`.

---

## Portals

### 👤 Customer Portal
- URL: `/` and `/menu`
- No login required for browsing
- OTP login required for placing orders (mocked in prototype)
- Test coupon codes: `FIRST50` (₹50 off), `WELCOME10` (10% off)

### 🍳 Restaurant Portal
- URL: `/restaurant`
- Access: Kitchen staff login (admin credentials required in production)
- Features: Order management, menu control, camera stream config

### 🛵 Rider Portal
- URL: `/rider`
- Access: Approved riders only (registration → admin approval flow)
- Features: Online/offline, delivery tracking, earnings

---

## Menu Data

All 64 menu items are sourced from `cloud_kitchen_pricing.xlsx` and embedded in `public/js/menu-data.js`.

| Category | Items | Price Range |
|---|---|---|
| Breakfast | 8 items | ₹59 – ₹149 |
| Maggi | 4 items | ₹89 – ₹129 |
| Main Course | 16 items | ₹129 – ₹229 |
| Rice & Breads | 11 items | ₹15 – ₹149 |
| Parathas | 6 items | ₹59 – ₹159 |
| Combos | 9 items | ₹139 – ₹229 |
| Snacks | 5 items | ₹69 – ₹139 |
| Sides | 4 items | ₹49 – ₹79 |

---

## Roadmap

### Phase 2 — Next.js Migration (Sprint 2)
- [ ] Migrate to Next.js 14 App Router
- [ ] Integrate Tailwind CSS
- [ ] Add PWA manifest + service worker (`next-pwa`)
- [ ] SSR for menu page (SEO)

### Phase 3 — Backend Integration
- [ ] MongoDB Atlas / PostgreSQL database
- [ ] REST API with Node.js / Express
- [ ] WebSocket for real-time order status
- [ ] Razorpay payment gateway
- [ ] Twilio OTP authentication

### Phase 4 — Live Streaming
- [ ] RTSP → HLS transcoding (FFmpeg)
- [ ] HLS.js player in customer app
- [ ] Per-order stream tokens
- [ ] WebRTC fallback

### Phase 5 — Maps & Logistics
- [ ] Google Maps API integration
- [ ] Live rider GPS via WebSocket
- [ ] Route optimization for multiple deliveries
- [ ] Geofence for delivery zones

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit changes: `git commit -m "feat: add your feature"`
4. Push: `git push origin feature/your-feature-name`
5. Open a Pull Request to `main`

---

## License

MIT License — © 2026 Open Kitchens

---

*Built with ❤️ in Bengaluru · Prototype v1.0.0 · March 2026*
