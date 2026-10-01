import { sqliteTable,text,integer } from 'drizzle-orm/sqlite-core';
export const products=sqliteTable('products',{id:text('id').primaryKey(),data:text('data').notNull(),archived:integer('archived').notNull().default(0)});
