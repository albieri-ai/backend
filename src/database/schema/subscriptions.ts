import {
	pgTable,
	serial,
	text,
	uniqueIndex,
	timestamp,
	integer,
	pgEnum,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { relations } from "drizzle-orm";

export const stripeCustomerId = pgTable(
	"stripe_customer_id",
	{
		id: serial().primaryKey(),
		user: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		stripeId: text().notNull(),
	},
	(table) => ({
		stripeCustomerIdUserIdx: uniqueIndex().on(table.user),
	}),
);

export const subscriptions = pgTable("subscriptions", {
	id: serial().primaryKey(),
	owner: text()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	organization: text().references(() => organizations.id, {
		onDelete: "set null",
	}),
	stripeId: text().notNull().unique(),
	createdAt: timestamp("created_at").defaultNow(),
	endAt: timestamp("end_at"),
});

export const SubscriptionLimit = pgEnum("subscription_limit", [
	"messages",
	"words",
]);

export const subscriptionPlans = pgTable("subscription_plans", {
	id: serial().primaryKey(),
	key: text().notNull(),
	name: text().notNull(),
	stripeId: text().notNull().unique(),
	stripeProductId: text().notNull(),
});

export const subscriptionPlanLimits = pgTable("subscription_plan_limits", {
	id: serial().primaryKey(),
	plan: integer()
		.notNull()
		.references(() => subscriptionPlans.id),
	key: SubscriptionLimit().notNull(),
	value: integer().notNull(),
	stripeId: text().notNull(),
	stripeMeterId: text().notNull(),
});

export const subscriptionLimits = pgTable(
	"subscription_limits",
	{
		id: serial().primaryKey(),
		subscription: integer()
			.notNull()
			.references(() => subscriptions.id, { onDelete: "cascade" }),
		key: SubscriptionLimit().notNull(),
		limit: integer().references(() => subscriptionPlanLimits.id, {
			onDelete: "cascade",
		}),
		value: text().notNull(),
	},
	(table) => ({
		subscriptionLimitSubscriptionKeyIdx: uniqueIndex().on(
			table.subscription,
			table.key,
		),
	}),
);

export const subscriptionUsageTrackWorkflow = pgTable(
	"subscription_usage_track_workflow",
	{
		id: serial().primaryKey(),
		subscription: integer().notNull().unique(),
		workflowId: text().notNull().unique(),
	},
);

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
	owner: one(users, {
		fields: [subscriptions.owner],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [subscriptions.organization],
		references: [organizations.id],
	}),
}));

export const subscriptionPlanRelations = relations(
	subscriptionPlans,
	({ many }) => ({
		limits: many(subscriptionPlanLimits),
	}),
);

export const subscriptionPlanLimitRelations = relations(
	subscriptionPlanLimits,
	({ one }) => ({
		plan: one(subscriptionPlans, {
			fields: [subscriptionPlanLimits.plan],
			references: [subscriptionPlans.id],
		}),
	}),
);

export const subscriptionLimitRelations = relations(
	subscriptionLimits,
	({ one }) => ({
		limit: one(subscriptionPlanLimits, {
			fields: [subscriptionLimits.limit],
			references: [subscriptionPlanLimits.id],
		}),
	}),
);
