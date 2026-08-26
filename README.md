# NIHPLOD

**NIHPLOD** is the official digital platform for the Monaco-based luxury skincare brand founded by David Nahmad and Dr. J. Stefan Rokem. This project represents a convergence of high-end beauty, biotechnology, and advanced artificial intelligence, designed to provide users with a personalized and immersive skincare experience.

The platform is not merely a showcase but a comprehensive application featuring AI-driven skin analysis, a deeply interactive user interface, and rich product presentations with referrals to third-party platforms.

## Project Overview

The NIHPLOD platform is built to reflect the brand's core philosophy: "Reversing Time." It combines a minimalist, luxury aesthetic with powerful functional modules.

### Core Objectives
*   **Digital Brand Experience:** To establish a premium online presence that conveys the brand's values of family, care, and scientific excellence.
*   **AI Skin Consultation:** To democratize professional skincare advice through an intelligent, automated advisor that analyzes user skin conditions and lifestyle factors.
*   **Product Discovery & Referral:** To facilitate product discovery and guide users to official flagship stores on third-party platforms.

## Key Features

### 1. AI Skin Advisor
The centerpiece of the platform is the **Intelligent Skin Advisor**.
*   **Face Scanning:** Utilizes client-side computer vision (Face-API) to analyze skin condition in real-time without compromising user privacy.
*   **Deep Analysis:** Processes visual data alongside user-reported lifestyle habits (sleep, environment, routine) to generate a comprehensive skin report.
*   **Personalized Regimen:** Recommends tailored product combinations and usage rituals based on specific skin needs.

### 2. Immersive User Experience
Designed with a "Mobile First" implementation that scales elegantly to desktop.
*   **Dynamic Interactions:** Powered by Framer Motion and GSAP for fluid transitions and micro-interactions that mimic the physical sensation of premium skincare.
*   **Visual Storytelling:** Dedicated modules for Brand Story, Rituals (SPA guides), and Product Exploration.

### 3. Product Showcase & User System
Product presentation combined with membership features.
*   **Product Catalog:** Rich product presentations with ingredient breakdowns and usage guides.
*   **Third-Party Referral:** Purchase links direct users to official flagship stores on platforms such as Tmall, Xiaohongshu, and Douyin.
*   **User Dashboard:** Personal center for managing profile information and membership status.
*   **Loyalty Program:** Points system to retain and reward customers.

### 4. Admin Management Dashboard
A comprehensive CMS for operational control.
*   **Product Management:** CRUD operations for the product catalog, purchase links, and categories.
*   **User Management:** Tools for managing user accounts and permissions.
*   **Content Management:** Editors for site content, including articles, rituals, and media assets.
*   **Analytics:** Visual dashboards for tracking user growth and system health.

## Technology Stack

The project utilizes a modern, type-safe full-stack TypeScript architecture.

### Frontend
*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **Animation:** Framer Motion, GSAP
*   **State Management:** Zustand

### Backend & Database
*   **Runtime:** Node.js (via Next.js API Routes)
*   **Database:** PostgreSQL
*   **ORM:** Prisma
*   **Authentication:** Custom JWT / NextAuth

### Infrastructure & Tools
*   **Deployment:** Docker / Vercel
*   **Linting/Formatting:** ESLint, Prettier
*   **Package Manager:** NPM

## Architecture

The codebase follows a modular structure optimized for Next.js App Router:

*   `src/app`: Application routes (Pages and API endpoints).
    *   `(website)`: Public-facing product showcase and brand pages.
    *   `(admin)`: Protected administrative dashboard.
*   `src/components`: Reusable UI components, categorized by domain (web/admin) and atomic design.
*   `src/lib`: Core utilities, including database clients, AI service wrappers, and helper functions.
*   `docs`: Comprehensive documentation including PRD, Tech Stack, and API references.

## Getting Started

To set up the project locally for development:

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Setup**:
    Copy `.env.example` to `.env` and configure your database and API keys.
4.  **Database Migration**:
    ```bash
    npx prisma generate
    npx prisma db push
    ```
5.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## License

This project is proprietary software developed for NIHPLOD. All rights reserved.
