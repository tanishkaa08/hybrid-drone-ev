
# 🚀 Hybrid Drone EV Delivery System

A hybrid delivery management platform that uses Electric Vehicles (EVs) and Drones to optimize last-mile delivery routes, reduce carbon emissions, and calculate efficiency in real-time.

---

## 📁 Project Structure

```
hybrid-drone-ev/
├── frontend/        # React + Tailwind (Vite)
└── backend/         # Node.js + Express + MongoDB
```

---

## ⚙️ Tech Stack

**Frontend:** React, Vite, Tailwind CSS  
**Backend:** Node.js, Express.js, Mongoose  
**Database:** MongoDB  
**API Integration:** Google Maps, OpenRouteService (planned)

---

## 🚀 Getting Started

### 🔧 Clone the Repository

```bash
git clone https://github.com/your-username/hybrid-drone-ev.git
cd hybrid-drone-ev
```

---

## 🔮 Frontend Setup

```bash
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite
npm run dev
```

> Make sure Tailwind is properly configured in `tailwind.config.js` and `index.css`

---

## 🌐 Backend Setup

```bash
cd ../backend
npm init -y
npm install express mongoose cors dotenv
```

### 📄 Create `.env` File

Create a `.env` file in `/backend` based on `.env.sample`:

```
PORT=8000
MONGO_URI=
CORS_ORIGIN=
```

> Replace `your-password` with your actual MongoDB password

---

### 🔁 Run the Backend Server

```bash
npm run dev
```

> Make sure MongoDB connection is successful before continuing

---

## ✅ Scripts

| Location  | Command       | Description                   |
|-----------|----------------|-------------------------------|
| `frontend` | `npm run dev`  | Starts Vite dev server        |
| `backend`  | `node run dev`  | Starts Express backend        |

---

## 📦 Git Best Practices

- `.env` is ignored using `.gitignore`
- Commit structure should separate frontend and backend changes
- Always run `npm install` after pulling latest changes

---

## 📸 Preview (Optional)

Add Figma/Design Preview link:  
[Figma Design](https://www.figma.com/design/gZnWW6CSJ91qvq0y7tPmSm/Untitled?node-id=0-1&p=f&t=IJUCLQRzIqN4bcZd-0)

---

## 🧠 Contributors

- Safal & Ayush - Optimizer Logic + API  
- Tanishka & Harshil - Frontend + UI/UX

---

## 📬 License

This project is open-source and available for educational use.
