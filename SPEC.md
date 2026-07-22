# SPEC.md — PPG Pulse data model, RBAC & API

## 1. Data model (Prisma / Postgres)

```
User            id, name, email(unique), passwordHash, roleId(fk Role), team,
                managerId(fk User, nullable), isActive, createdAt
                // per-user overrides -> UserOverride[]
Role            id, key(unique), label, sub, scope('org'|'team'|'own'),
                isSystem(bool), isProtected(bool), createdAt
RolePermission  id, roleId(fk), section, capability   // section x cap grid
UserOverride    id, userId(fk), section, capability    // extra grants outside role

Consultant      id, userId(fk User, unique), pod('Pod A'|...), eventsHosted,
                eventsParticipated, insights            // PPG member profile

Requirement     id, code(e.g. Q1-001), jdId(nullable, fk Hdis.jdId), owner(fk Consultant),
                title, client, reqDate, status('Active'|'On Hold'|'Closed'),
                profiles, shortlist, l1, l2, l3, onboard   // legacy seed-only table;
                // nothing in the live app writes to it (see note below) — kept for the
                // original seed data only, not used by /report/* as of the HDIS switch.

Hdis            jdId(pk, string e.g. VAY_AC_20260701), title, client,
                type('RADC'|'RADF'|'Internal'), openings, status('Active'|'On Hold'|
                'Fulfilled'|'Closed'), statusReason(nullable), remarks(nullable),
                priority, confidence, reqDate, jdLink(nullable), createdAt, updatedAt
HdisOwner       id, jdId(fk), consultantOrName        // owners (may be non-PPG names)
HdisPipeline    jdId(pk fk Hdis), r0,r1,r2,r3,r4,r5(int), stage(string), updatedAt
                // r0..r5 = Profiles/Shortlist/L1/L2/L3/Onboard — logged live via the
                // HDIS record detail page's pipeline recorder.
HdisAttachment  id, jdId(fk), fileName, storageKey, contentType, size, uploadedBy, at
HdisActivity    id, jdId(fk), actorId(fk User), action, detail, at   // append-only log

Interview       id, date(YYYY-MM-DD), session('mid'|'end'), time, candidate,
                requirementRef(string), ppgConsultantId(fk, nullable), stage, status,
                notes, createdBy(fk User), createdAt
```

Indexes: `Requirement(owner, reqDate)`, `Requirement(reqDate)`, `Interview(date)`,
`HdisActivity(jdId, at)`, `User(email)`.

Seed: `/server/prisma/seed.json` (provided) → 13 users, 3 roles, 10 consultants,
145 requirements, 138 HDIS records with owners. Passwords seeded to `Passw0rd!`
(dev only), forced reset flag optional.

**`/report/*` data source:** Home, the Team Roster, and the per-consultant report all
read live from `Hdis` + `HdisOwner` + `HdisPipeline` — not `Requirement`. Requirement
rows are only ever written by the seed script, so a dashboard built on them would never
reflect anything entered through the live HDIS UI. Each `HdisOwner` row is one
"requirement" in the old sense (a JD × owner pair); `HdisPipeline.r0..r5` supplies the
Profiles/Shortlist/L1/L2/L3/Onboard funnel numbers Requirement used to carry, `Hdis.type`
supplies the RADC/RADF category directly (no join needed), and `Fulfilled` is bucketed
with `Closed` for the "Total Closures" tile and the closed side of any status split.

## 2. RBAC

Sections: `home, interviews, hdis, myteam, profile, users, roles, hierarchy, auditlog, dhruva, kpis`
Capabilities per section: `view, add, edit, delete` (+ `export` where relevant).

Default role → permission matrix:

| Section     | super_admin        | hr_manager                  | consultant        |
|-------------|--------------------|-----------------------------|-------------------|
| home        | view               | view                        | view (own/team)   |
| interviews  | view, edit         | view, edit                  | view, edit        |
| hdis        | view,add,edit,delete | view,add,edit,delete      | view, add (own JDs only — see below) |
| myteam      | view               | view                        | view (own/team)   |
| profile     | view, edit         | view, edit                  | view, edit        |
| users       | view, edit         | view, edit*                 | —                 |
| roles       | view, edit         | view, edit*                 | —                 |
| hierarchy   | view, edit         | view, edit                  | —                 |
| auditlog    | view               | —                            | —                 |
| dhruva      | view               | —                            | —                 |
| kpis        | view,add,edit,delete | —                          | —                 |

Special rules (must be enforced server-side + tested):
- `scope`: `super_admin`/`hr_manager` = `org`; `consultant` = `team`. `team` = the
  user's name + everyone in the reporting subtree + same-`team` peers.
- **HR cannot touch Super Admin**: an `hr_manager` may not edit, delete, change the role
  of, or reset the password of any `super_admin` user, nor edit the `super_admin` role
  (`isProtected`). Super Admin *can* manage HR Managers.
- Multiple `hr_manager`s allowed; one may `managerId` → another HR Manager.
- Effective permissions = role permissions ∪ user overrides. `can(section, cap)` checks
  this union. Overrides can only *grant*, never revoke a protected safety rule above.
- Custom roles: `super_admin` and `hr_manager` (per matrix) may create/edit non-system
  roles; only `super_admin` may edit protected/system roles.

## 3. API surface (REST, all under `/api`, JWT required except auth)

```
POST /auth/login            {email,password} -> {access, refresh, user}
POST /auth/refresh          {refresh} -> {access}
POST /auth/logout
GET  /me                    -> current user + effective permissions + scope

# People / report
GET  /consultants?scope           -> consultants visible to caller (scoped)
GET  /report/overview?from&to&month&fy   -> tiles + chart series (scoped, sourced live
                                             from Hdis/HdisOwner/HdisPipeline)
GET  /report/consultant/:id?from&to&month&fy -> confidence, funnel, kpi, requirements
GET  /requirements/:id            -> requirement (HDIS jdId) detail + co-owners on same jd
GET  /report/dhruva?priority&client&ppg&from&to -> super-admin-only org-wide dashboard:
                                     RAPYD Active split, Active Clients, Interviews Today
                                     split, Priority (P1/P2/P3/Uncategorised) tiles, the
                                     org-wide R0-R5 funnel with drop-off % (filterable by
                                     priority/client/PPG owner/date range), and Top
                                     Clients by people deployed (RADC/RADF, top 5 each).
                                     perm dhruva.view (super_admin only)

# HDIS
GET  /hdis?month&status&q                 -> list (monthly)
POST /hdis                                -> create (perm hdis.add)
GET  /hdis/:jdId                          -> detail (record + pipeline + attachments + activity)
PATCH/hdis/:jdId                          -> edit (perm hdis.edit)
DELETE /hdis/:jdId                        -> delete (perm hdis.delete)
PUT  /hdis/:jdId/pipeline                 -> {r0..r5, stage} update -> logs activity
POST /hdis/:jdId/attachments              -> multipart PDF/DOC upload -> StorageService
POST /hdis/:jdId/link                     -> {jdLink} set/clear
GET  /hdis/:jdId/activity                 -> activity log

# Interviews
GET  /interviews?month                    -> per-day counts for month
GET  /interviews/day/:date                -> {mid:[], end:[]} + consultant-wise
POST /interviews                          -> add row (perm interviews.edit)
PATCH /interviews/:id                     -> edit
DELETE /interviews/:id                    -> delete

# Admin
GET/POST/PATCH/DELETE /users              -> user mgmt (enforce HR-vs-SuperAdmin rules)
POST /users/:id/overrides                 -> grant override
GET/POST/PATCH/DELETE /roles              -> role builder (system/protected guarded)
GET  /hierarchy                           -> org tree
PATCH /users/:id/manager                  -> reporting line (cycle-guard)
GET/POST/PATCH/DELETE /kpis               -> People Group KPI scorecard master list
                                             (kpiNo, symbol, title, target, description,
                                             periodicity, whyItMatters) — perm kpis.*
                                             (super_admin only)
```

Every endpoint: zod-validate input, authorize (role/override + scope), return typed DTO,
and be covered by a test asserting **both** an allowed and a denied case.

## 4. Derived metrics (match prototype)
- `personStats` over reqs in period: reqs, closed(=onboard>0 or status Closed/Fulfilled),
  profiles(Σprofiles), shortlist(Σshortlist), onboard(Σonboard).
- `confidence` 0–100 = 0.3·pipelineProgression + 0.25·shortlistQuality + 0.2·tat +
  0.25·conversion (see prototype `confidence()` for exact formulas).
- `kpiRating` 0–4 heuristic (see prototype).
- Overview tiles: Requirements Received, Total Closures (+ RADC/RADF split via HDIS type),
  Total Requirements, Insights Published, Events Hosted, Events Participated, Consultants.
- Charts: requirements-by-consultant (h-bar), status mix (donut), closures-by-consultant,
  confidence-by-consultant. All scoped + period-filtered.
- Status mix is broken down by the HDIS status-reason detail rather than the bare
  status — e.g. "Fulfilled by VAYUZ" vs "Fulfilled by others", "Hold By client" vs
  "Hold By VAYUZ" — grouped under Active/On Hold/Fulfilled/Closed in that order
  (`statusReasonMix` in `report/metrics.ts`), falling back to the bare status when no
  reason was recorded.

## 5. Non-functional
- CORS locked to web origin; helmet; rate-limit auth; refresh-token rotation.
- Uploads: validate mime (`application/pdf`, msword/openxml), max 10MB, virus-scan hook
  stub. Store outside webroot; serve via authorized `GET /hdis/:jdId/attachments/:id`.
- Audit: all HDIS + user/role mutations logged with actor + timestamp.
- Seed + migrations idempotent; `npm run reset` drops+migrates+seeds.
