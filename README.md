# RescuePath AI - Emergency Ambulance Routing

RescuePath AI is a full-stack web application designed to optimize and route emergency ambulances in real-time. It provides a real-time tracking interface, robust hospital routing logic, and features to streamline emergency response workflows.

## Features

- **Real-time Ambulance Tracking**: Live tracking of ambulance locations using Socket.IO.
- **Emergency Routing**: Automated routing from emergency locations to suitable hospitals.
- **Map Interface**: Interactive map visualization built with React Leaflet.
- **Authentication**: Secure driver registration and login system.
- **SQLite Database**: Local database for managing users, ambulances, emergencies, and routes.
- **Responsive UI**: Modern interface styled with Tailwind CSS.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, React Leaflet, Lucide React, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite (better-sqlite3)
- **Language**: TypeScript / JavaScript

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (Node Package Manager)

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` or `.env.local` file in the root directory if you need to override any defaults.
   Example:
   ```env
   PORT=3002
   DB_NAME=driverdb
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Note: This command runs both the Express backend and the Vite frontend simultaneously using Vite middleware.*

4. **Access the application:**
   Open your browser and navigate to `http://localhost:3002`.

## Database Schema

The application automatically creates the SQLite database (`driverdb.sqlite`) and initializes the following tables on startup:
- `users`: Driver authentication and details
- `ambulances`: Ambulance details and real-time status/location
- `emergencies`: Emergency request information
- `routes`: Computed routes and metadata

## Scripts

- `npm run dev`: Starts the development server with hot-module replacement.
- `npm run build`: Builds the application for production.
- `npm run preview`: Locally preview the production build.
- `npm run clean`: Removes the `dist` directory.
- `npm run lint`: Runs TypeScript compilation check.
