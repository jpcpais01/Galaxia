# Galaxia — Setup Guide

## 1. Firebase Setup

Create a project at https://console.firebase.google.com

**Enable these services:**
- Authentication → Sign-in method → Email/Password ✓
- Firestore Database → Start in test mode (then apply security rules)

**Get config keys:**
Project Settings → General → Your apps → Web app → Config

## 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Firebase keys:

```bash
cp .env.local.example .env.local
```

## 3. Firestore Security Rules

In Firebase Console → Firestore → Rules, paste the content of `firestore.rules`.

## 4. Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (add env vars in Vercel dashboard)
vercel
```

Add all `NEXT_PUBLIC_FIREBASE_*` variables in Vercel → Project Settings → Environment Variables.

---

## Game Guide

### Getting Started
1. Register a username + password
2. Create a new game or join an existing one
3. Set bot count (0–20) and max players
4. Click **Launch Game**

### Gameplay
- **Galaxy View** — Scroll/pan/zoom the star map. Click systems to select.
- **Survey** a system to reveal its planets and resources
- **Build a Space Station** to claim the system (costs 300 minerals + 200 credits)
- **Colonize** a planet in a controlled system (costs 150 credits)
- **Build Infrastructure** on colonized planets to generate resources
- **Research** the 5 tech trees to unlock bonuses

### Resources
| Resource | Use |
|----------|-----|
| ⚡ Energy | Powers buildings and population |
| 🌿 Food | Feeds population (negative → starvation) |
| ⛏ Minerals | Build everything |
| 🔬 Research | Unlock technologies |
| 💻 Compute | Advanced AI research |
| 💱 Credits | Trade, colonize, diplomacy |
| 👥 Population | Workers — generates passively from Colony Hubs |

### Ship Designer
Click **DESIGN** → draw your ship on the 8×8 grid → Save → Build from SHIPS panel (requires Shipyard infrastructure)

### Diplomacy
Click **DIPL** → propose NAP, Trade, Alliance or War to other empires

### Galactic Assembly
Click **ASMBL** → propose resolutions → all empires vote AYE/NAY

### Winning
Dominate the galaxy by controlling the most systems, completing key research, or achieving diplomatic victory through the Assembly.
