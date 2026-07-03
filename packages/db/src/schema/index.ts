import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export * from "./billing";
export * from "./enums";
export * from "./observation";
export * from "./intelligence";
export * from "./ops";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  workosUserId: text("workos_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profilePictureUrl: text("profile_picture_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
