# Course Planner

A full-stack web application that helps students plan courses across semesters, validate prerequisites, and track degree progress.

Built with a modern React frontend, a Node.js backend, and a PostgreSQL database, and fully deployed to the cloud.

---

## 🌐 Live Demo
🔗 [https://course-planner.vercel.app](https://course-planner-k7rm.vercel.app)

The app is publicly accessible and does not require running anything locally.

---

## 🚀 Features
- Search and browse courses in real time
- Plan courses across multiple semesters
- Validate prerequisites and course combinations
- Track completed, in-progress, and planned courses
- Persist plans using a relational database

---

## 🛠 Tech Stack

### Frontend
- React + TypeScript
- Vite
- Deployed on **Vercel**

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL
- Deployed on **Render**

---

## 🧠 Architecture Overview
- The frontend communicates with the backend via RESTful API endpoints under `/api`
- In production, Vercel rewrites API requests to the Render backend
- Prisma handles database access and schema management
- Environment variables are used for secure configuration (API tokens, database URL)

---
