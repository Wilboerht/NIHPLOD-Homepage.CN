# NIHPLOD China Official Website

The official high-end digital platform for NIHPLOD, a luxury skincare brand. This platform integrates brand storytelling, a sophisticated e-commerce engine, and an advanced AI-powered skincare consultancy system.

## Project Vision

Designed to deliver a premium, seamless digital experience that reflects the brand's commitment to cutting-edge science and luxury. The platform prioritizes visual excellence, interactive engagement, and personalized skincare analysis.

## Core Features

### Luxury E-commerce Engine
- **Product Ecosystem**: Advanced product categorization with detailed ritual guides.
- **Unified Checkout**: Seamless shopping cart and order processing.
- **Multi-Payment Support**: Integration with WeChat Pay and Alipay.
- **Loyalty & Points**: Integrated user point system for customer engagement and rewards.
- **Logistics Tracking**: Real-time order status and logistics management.

### AI Skincare Advisor (Advanced)
- **Face Analysis**: Real-time biometric skin scanning using Face API.
- **Smart Recommendations**: Specialized dosage and product prescriptions based on AI analysis.
- **Smart Analysis**: Deep skin health insights powered by OpenAI.
- **Social Integration**: Reward-sharing mechanisms for consultants and users.

### Content & Activity Management
- **Brand Storytelling**: Immersive narrative experience with high-end animations.
- **Ritual Guides**: Interactive skincare instructions and dosage calculators.
- **Lottery System**: Engagement-driven activity system for brand promotions.
- **Recruitment**: Integrated career portal and application management.

### Enterprise Admin Dashboard
- **Data Visualization**: Real-time sales and user analytics using ECharts and Recharts.
- **Asset Hub**: Comprehensive media and content management system.
- **User Insights**: Detailed CRM for managing customer relationships and order histories.
- **System Settings**: Global configuration for payments, notifications, and SEO.

## Technical Stack

### Frontend Architecture
- **Framework**: Next.js 14 (App Router) with View Transitions.
- **Language**: TypeScript for type-safe development.
- **Styling**: TailwindCSS for layout, GSAP and Framer Motion for high-end micro-interactions.
- **Experience**: Three.js and OGL for 3D brand elements.
- **Interactive**: Tiptap for rich content editing and Lottie for vector animations.

### Backend & Infrastructure
- **Database**: PostgreSQL with Prisma ORM.
- **Storage**: Supabase Storage for high-speed media delivery.
- **AI Integration**: OpenAI API and Face API for smart features.
- **Communications**: Integrated SMS and Email notification systems.
- **Search & SEO**: Advanced JSON-LD structured data, dynamic sitemap, and robots optimization.

### Security & Optimization
- **Rate Limiting**: Integrated security layers for API protection.
- **Geo-targeting**: Maxmind integration for location-aware services.
- **Image Optimization**: Sharp-based server-side image processing.
- **Performance**: Edge-ready API routes and optimized static generation.

## Project Structure

```
src/
├── app/              # Next.js App Router (Admin & Website)
├── components/       # Visual components and UI primitives
├── config/           # Site and system configurations
├── contexts/         # State management providers
├── hooks/            # Reusable business logic hooks
├── lib/              # Core utilities (Payment, AI, Security)
├── schemas/          # Data validation and Zod models
└── types/            # Global type definitions
```

## Getting Started

### Prerequisites
- Node.js 18 or higher
- PostgreSQL Database
- Supabase Account
- API Keys for OpenAI and Payment Gateways

### Installation
1. **Repository Setup**
   ```bash
   git clone <repository-url>
   cd nihplod.cn
   ```

2. **Dependencies**
   ```bash
   npm install
   ```

3. **Environments**
   ```bash
   cp .env.example .env.local
   # Configure your environment variables
   ```

4. **Database Initialization**
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Development**
   ```bash
   npm run dev
   ```

## Documentation

Extensive documentation is available in the /docs directory:
- Technical Architecture
- API Definitions
- Database Schema
- UX/UI Guidelines
- Deployment & Upgrade Plans

## Proprietary Notice and License

**CONFIDENTIAL AND PROPRIETARY.**

This project is NOT an open-source software. All code, designs, and assets within this repository are the exclusive property of NIHPLOD. 

Unauthorized copying, modification, distribution, or any form of use of these files, via any medium, is strictly prohibited without explicit written permission from the copyright owner.

Copyright © 2026 NIHPLOD. All Rights Reserved.
