import {
  pgTable,
  foreignKey,
  text,
  jsonb,
  timestamp,
  uuid,
  integer,
  numeric,
  primaryKey,
  unique,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "@auth/core/adapters";
import { relations, sql } from "drizzle-orm";

// --- Auth.js Tables ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  organizationId: uuid("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").$type<"active" | "pending" | "invited" | "deactivated">().default("pending"),
  lastLogin: timestamp("last_login", { mode: "date" }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: "date" }),
  invitationExpiresAt: timestamp("invitation_expires_at", { mode: "date", withTimezone: true }),
  invitationSentAt: timestamp("invitation_sent_at", { mode: "date", withTimezone: true }),
}, (t) => ({ emailNormalizedKey: uniqueIndex("user_email_normalized_unique").on(sql`lower(btrim(${t.email}))`) }));

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
    name: text("name"),
  },
  (authenticator) => ({
    compositePK: primaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  })
);

// --- Application Tables ---

export const roles = pgTable("roles", {
  id: text("id").primaryKey(), // "basic_user", "org_manager", "org_view_only", "global_view_only", "admin", "super_admin"
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.roleId] }),
}));

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: text("type"), // e.g., 'B&I', 'Care'
  createdAt: timestamp("created_at").defaultNow(),
});

export const subOrganizations = pgTable("sub_organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  foodWasteBaseDate: timestamp("food_waste_base_date", { mode: "date" }),
  foodWasteBaseAmount: numeric("food_waste_base_amount"),
  baselineRevision: integer('baseline_revision').notNull().default(0),
}, (t) => ({ orgIdKey: unique("sub_organizations_org_id_key").on(t.organizationId, t.id) }));

export const subOrganizationMembers = pgTable("sub_organization_members", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subOrganizationId: uuid("sub_organization_id")
    .notNull()
    .references(() => subOrganizations.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.subOrganizationId] }),
}));

export const indicatorData = pgTable("indicator_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  subOrganizationId: uuid("sub_organization_id")
    .notNull()
    .references(() => subOrganizations.id, { onDelete: "cascade" }),
  
  reportingYear: integer("reporting_year").notNull(),
  reportingMonth: integer("reporting_month").default(0), // NULL = explicit quarter, 0 = annual, 1-12 = month
  periodKind: text('period_kind').$type<'month' | 'quarter' | 'year'>(),
  periodIndex: integer('period_index'),
  revision: integer('revision').notNull().default(1),
  coverageConfirmed: boolean('coverage_confirmed').notNull().default(false),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),

  // Financials
  totalFoodSpend: numeric("total_food_spend"),
  
  // Indicator 1: Plant Based
  meatSpend: numeric("meat_spend"),
  fishSpend: numeric("fish_spend"),
  dairySpend: numeric("dairy_spend"),
  eggSpend: numeric("egg_spend"),
  mixedProductSpend: numeric("mixed_product_spend"),
  
  // Indicator 2: Organic
  organicSpend: numeric("organic_spend"),
  
  // Indicator 3: Fair Trade
  coffeeSpend: numeric("coffee_spend"),
  cocoaSpend: numeric("cocoa_spend"),
  bananasSpend: numeric("bananas_spend"),
  cocoaMixedSpend: numeric("cocoa_mixed_spend"),
  
  fairTradeCoffeeSpend: numeric("fair_trade_coffee_spend"),
  fairTradeCocoaSpend: numeric("fair_trade_cocoa_spend"),
  fairTradeBananasSpend: numeric("fair_trade_bananas_spend"),
  fairTradeCocoaMixedSpend: numeric("fair_trade_cocoa_mixed_spend"),
  
  foodWasteAmount: numeric("food_waste_amount"),

  // Scoring Results (Qualitative Questions 0-100)
  plantBasedScoringResult: numeric("plant_based_scoring_result"),
  organicScoringResult: numeric("organic_scoring_result"),
  fairTradeScoringResult: numeric("fair_trade_scoring_result"),
  foodWasteScoringResult: numeric("food_waste_scoring_result"),
  regionalScoringResult: numeric("regional_scoring_result"),
  seasonalScoringResult: numeric("seasonal_scoring_result"),
  guestSatisfactionScoringResult: numeric("guest_satisfaction_scoring_result"),

  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  activePeriod: uniqueIndex('indicator_active_period').on(t.organizationId, t.subOrganizationId, t.reportingYear, t.periodKind, t.periodIndex).where(sql`${t.supersededAt} IS NULL`),
  orgSubFk: foreignKey({ name: "indicator_data_org_sub_fk", columns: [t.organizationId, t.subOrganizationId], foreignColumns: [subOrganizations.organizationId, subOrganizations.id] }).onDelete("cascade"),
}));

export const operatingReportingModes = pgTable('operating_reporting_modes', {
  organizationId: uuid('organization_id').notNull(),
  subOrganizationId: uuid('sub_organization_id').notNull(),
  reportingYear: integer('reporting_year').notNull(),
  mode: text('mode').$type<'legacy' | 'quarterly'>().notNull().default('legacy'),
  revision: integer('revision').notNull().default(1),
}, t => ({ pk: primaryKey({ columns: [t.subOrganizationId, t.reportingYear] }) }));

export const operatingEntryDrafts = pgTable('operating_entry_drafts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  subOrganizationId: uuid('sub_organization_id').notNull(),
  reportingYear: integer('reporting_year').notNull(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workflow: text('workflow').$type<'quarter' | 'batch' | 'year'>().notNull(),
  quarter: integer('quarter').notNull(),
  payload: jsonb('payload').notNull().$type<import('@/lib/operating-data/publication').EntryDraft>(),
  revision: integer('revision').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ identity: unique().on(t.authorId, t.subOrganizationId, t.reportingYear, t.workflow, t.quarter) }));

export const operatingReportingPreferences = pgTable('operating_reporting_preferences', {
  organizationId: uuid('organization_id').notNull(),
  subOrganizationId: uuid('sub_organization_id').notNull(),
  reportingYear: integer('reporting_year').notNull(),
  frequency: text('frequency').$type<import('@/lib/operating-data/preferences').ReportingFrequency>().notNull(),
  revision: integer('revision').notNull().default(1),
  source: text('source').$type<'user' | 'legacy'>().notNull().default('user'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  annualRecordId: uuid('annual_record_id'),
  annualRecordRevision: integer('annual_record_revision'),
  annualConfirmedAt: timestamp('annual_confirmed_at', { withTimezone: true }),
  annualConfirmedBy: text('annual_confirmed_by'),
  annualConfirmationSource: text('annual_confirmation_source').$type<'user' | 'legacy'>(),
}, t => ({ pk: primaryKey({ columns: [t.subOrganizationId, t.reportingYear] }),
  orgSubFk: foreignKey({ columns: [t.organizationId, t.subOrganizationId], foreignColumns: [subOrganizations.organizationId, subOrganizations.id] }).onDelete('cascade'),
}));

export const operatingMutationReceipts = pgTable('operating_mutation_receipts', {
  requestId: uuid('request_id').notNull(), actorId: text('actor_id').notNull(),
  organizationId: uuid('organization_id').notNull(), subOrganizationId: uuid('sub_organization_id').notNull(),
  payloadHash: text('payload_hash').notNull(), result: jsonb('result').notNull().$type<{ revisions: Record<string, number>; baselineRevision: number; modeRevision: number; preferenceRevision?: number }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ pk: primaryKey({ columns: [t.actorId, t.requestId] }) }));

export const operatingDataRevisions = pgTable('operating_data_revisions', {
  id: uuid('id').defaultRandom().primaryKey(), organizationId: uuid('organization_id').notNull(),
  subOrganizationId: uuid('sub_organization_id').notNull(), reportingYear: integer('reporting_year'),
  actorId: text('actor_id'), requestId: text('request_id'), reason: text('reason'),
  source: text('source').notNull(), before: jsonb('before'), after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- App Content Table ---

export const appContent = pgTable("app_content", {
  key: text("key").primaryKey(), // e.g., 'methodology_title', 'dashboard_subtitle'
  value: text("value").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Qualitative Responses Table ---

export const qualitativeResponses = pgTable("qualitative_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  subOrganizationId: uuid("sub_organization_id")
    .notNull()
    .references(() => subOrganizations.id, { onDelete: "cascade" }),

  indicatorSlug: text("indicator_slug").notNull(),

  reportingYear: integer("reporting_year").notNull(),

  questionKey: text("question_key").notNull(),

  responseType: text("response_type").$type<"text" | "select" | "multiple-choice" | "date" | "number">().default("text"),
  responseText: text("response_text"),
  responseNumber: numeric("response_number"),
  responseOption: text("response_option"),
  responseMultiple: jsonb("response_multiple").$type<string[]>(),
  responseDate: timestamp("response_date", { mode: "date" }),

  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  orgSubFk: foreignKey({ name: "qualitative_responses_org_sub_fk", columns: [t.organizationId, t.subOrganizationId], foreignColumns: [subOrganizations.organizationId, subOrganizations.id] }).onDelete("cascade"),
  unq: unique().on(
    t.organizationId, t.subOrganizationId,
    t.indicatorSlug, t.reportingYear, t.questionKey
  ),
}));

// --- Intake / Reflection Responses Table ---

export const intakeResponses = pgTable("intake_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  indicatorSlug: text("indicator_slug").notNull().default('general'),

  questionKey: text("question_key").notNull(),

  responseType: text("response_type").$type<"text" | "select" | "multiple-choice" | "date" | "number" | "boolean">().default("text"),
  responseText: text("response_text"),
  responseNumber: numeric("response_number"),
  responseOption: text("response_option"),
  responseBoolean: boolean("response_boolean"),
  responseMultiple: jsonb("response_multiple").$type<string[]>(),
  responseDate: timestamp("response_date", { mode: "date" }),

  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  unq: unique().on(t.organizationId, t.indicatorSlug, t.questionKey),
}));

// --- Data Freeze Table ---

export const dataFreezes = pgTable("data_freezes", {
  id: uuid("id").defaultRandom().primaryKey(),
  year: integer("year").notNull().unique(),
  frozenAt: timestamp("frozen_at").defaultNow(),
  frozenBy: text("frozen_by").references(() => users.id, { onDelete: "set null" }),
});

// Self-contained reports survive changes to inputs, baselines and methodology.
// Access is checked against current kitchen membership before any read.
export const indicatorReportSnapshots = pgTable('indicator_report_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  subOrganizationId: uuid('sub_organization_id').notNull(),
  reportingYear: integer('reporting_year').notNull(),
  granularity: text('granularity').notNull(),
  formulaVersion: text('formula_version').notNull(),
  inputRevision: text('input_revision').notNull(),
  payload: jsonb('payload').notNull().$type<import('@/lib/indicators/report').CalculationReport>(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => ({ revision: unique().on(t.subOrganizationId, t.reportingYear, t.granularity, t.formulaVersion, t.inputRevision) }));

// --- Revoked Sessions Table (ISO 27001 A.8.5) ---

export const revokedSessions = pgTable("revoked_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  revokedAt: timestamp("revoked_at").defaultNow().notNull(),
  reason: text("reason").$type<"logout_all" | "admin_revoked" | "deactivated">().default("logout_all"),
});

// --- Audit Log Table (ISO 27001 A.8.15) ---

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource"),
  resourceType: text("resource_type"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  severity: text("severity").$type<"info" | "warning" | "critical">().default("info").notNull(),
});

// Mark RLS in Drizzle metadata without narrowing the table types expected by Auth.js.
// Policies, FORCE RLS, grants, and security functions live in the SQL migrations.
for (const table of [users, accounts, sessions, verificationTokens, authenticators,
  roles, userRoles, organizations, subOrganizations, subOrganizationMembers,
  indicatorData, appContent, qualitativeResponses, intakeResponses, dataFreezes,
  revokedSessions, auditLogs, operatingReportingModes, operatingEntryDrafts,
  operatingMutationReceipts, operatingDataRevisions, operatingReportingPreferences]) table.enableRLS();

// --- Relations ---

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  subOrganizationMembers: many(subOrganizationMembers),
  authenticators: many(authenticators),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  subOrganizations: many(subOrganizations),
  users: many(users),
  indicatorData: many(indicatorData),
  qualitativeResponses: many(qualitativeResponses),
  intakeResponses: many(intakeResponses),
}));

export const subOrganizationsRelations = relations(subOrganizations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subOrganizations.organizationId],
    references: [organizations.id],
  }),
  indicatorData: many(indicatorData),
  qualitativeResponses: many(qualitativeResponses),
  members: many(subOrganizationMembers),
}));

export const subOrganizationMembersRelations = relations(subOrganizationMembers, ({ one }) => ({
  subOrganization: one(subOrganizations, {
    fields: [subOrganizationMembers.subOrganizationId],
    references: [subOrganizations.id],
  }),
  user: one(users, {
    fields: [subOrganizationMembers.userId],
    references: [users.id],
  }),
}));

export const indicatorDataRelations = relations(indicatorData, ({ one }) => ({
  organization: one(organizations, {
    fields: [indicatorData.organizationId],
    references: [organizations.id],
  }),
  subOrganization: one(subOrganizations, {
    fields: [indicatorData.subOrganizationId],
    references: [subOrganizations.id],
  }),
}));

export const qualitativeResponsesRelations = relations(qualitativeResponses, ({ one }) => ({
  organization: one(organizations, {
    fields: [qualitativeResponses.organizationId],
    references: [organizations.id],
  }),
  subOrganization: one(subOrganizations, {
    fields: [qualitativeResponses.subOrganizationId],
    references: [subOrganizations.id],
  }),
}));

export const intakeResponsesRelations = relations(intakeResponses, ({ one }) => ({
  organization: one(organizations, {
    fields: [intakeResponses.organizationId],
    references: [organizations.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
}));
