# TaskFlow API — Refactored Solution

This repository contains an architecturally improved, scalable, secure, and production-ready version of the TaskFlow challenge API.

---

## 1️⃣ Analysis of the Core Problems Identified

The original codebase deliberately contained critical anti-patterns and weaknesses:

- **Performance:** In-memory filtering/pagination introduced N+1 query problems, and batch processes ran sequentially causing excessive database calls.
- **Architecture:** Controllers accessed repositories directly; lack of service boundaries, transactions, and domain separation made logic hard to scale or maintain.
- **Security:** No refresh-token handling, no authorization for admin/user separation, sensitive exception info was leaked, and rate limiting used unsafe in-memory storage.
- **Reliability:** Queue processor handled jobs sequentially with no retry or backoff strategy, no error resilience, and caching was non-distributed (single instance only).

---

## 2️⃣ Overview of Architectural Approach

- Adopted a **layered architecture** → `Controller → Service → Repository`.
- All business logic moved into service layer; controllers are thin.
- Introduced **BullMQ queue processors** with retry, backoff, and concurrency for resilient background processing.
- Added **cross-cutting concerns** (rate limiting, caching, authorization, validation, logging, error handling) using NestJS Guards, Pipes, Interceptors, and Filters.
- Implemented **global error filter** and response formatter for clean & safe API responses.

---

## 3️⃣ Performance & Security Improvements

### 🚀 **Performance Enhancements**
- Moved pagination and filtering to DB-level using QueryBuilder.
- Used `.whereInIds()` and `.delete().whereInIds()` for bulk updates/deletes.
- Added SQL aggregation for stats endpoints (instead of `.filter()`).
- Used `addBulk()` in queue processor with chunking (`CHUNK_SIZE`) to avoid N+1 style processing.

### 🔐 **Security Enhancements**
- Added **refresh token rotation** (`/auth/refresh-token`) with hashing & revoke logic.
- Implemented **role-based access control** with `RolesGuard` and `@Roles` decorator.
- Rewrote **RateLimit guard** to use SHA-256 hashed IP with Redis/Cache backend.
- Added global `ValidationPipe` to sanitize/validate all incoming DTOs.
- Created `AllExceptionsFilter` to prevent leaking internal exception details in responses.

---

## 4️⃣ Key Technical Decisions & Rationale

| Decision                                       | Reasoning                                                                      |
|-----------------------------------------------|---------------------------------------------------------------------------------|
| Redis-backed Cache & RateLimit                | Allows horizontal scalability (multi-instance deployments).                    |
| Depot of Background Jobs to BullMQ            | Improves resilience, supports backoff/retry and prevents blocking controllers.  |
| DataSource Transaction Wrappers in Services   | Ensures database integrity during batch operations.                            |
| DTO validation + Sanitization                 | Prevents unknown/malicious fields — “secure-by-default”.                        |
| Global success/error response interfaces      | Keeps API consistent and easy to consume by frontend or third parties.         |

---

## 5️⃣ Trade-offs Made

| Tradeoff                                      | Explanation                                                                     |
|-----------------------------------------------|---------------------------------------------------------------------------------|
| Bulk SQL updates skip ORM hooks               | Improved performance at cost of not triggering entity lifecycle events.         |
| ValidationPipe strictness                     | Enforces DTO structure but may break flexible legacy clients.                  |
| Redis dependency                              | Adds infrastructure requirement but enables production-grade features.         |
| Strict role guarding                          | Increases complexity but prevents privilege escalation vulnerabilities.        |

---

## 📦 Run locally

```bash
bun install
cp .env.example .env
bun run build
bun run migration:custom
bun run seed
bun run start:dev
