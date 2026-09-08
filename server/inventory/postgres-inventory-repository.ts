import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { inventoryAdjustments, inventoryItems } from '@/db/schema';
import { getDatabase } from '@/server/db/client';

import type {
  CreateInventoryItemInput,
  InventoryAdjustmentReason,
  InventoryItem,
  InventoryOutcome,
  InventoryRepository,
  UpdateInventoryItemInput,
} from './inventory-repository';

export class PostgresInventoryRepository implements InventoryRepository {
  async listInventory(): Promise<InventoryItem[]> {
    const database = getDatabase();
    const rows = await database
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        category: inventoryItems.category,
        unit: inventoryItems.unit,
        quantityOnHand: inventoryItems.quantityOnHand,
        lowStockThreshold: inventoryItems.lowStockThreshold,
        notes: inventoryItems.notes,
        updatedAt: inventoryItems.updatedAt,
      })
      .from(inventoryItems)
      .orderBy(inventoryItems.name);
    return rows.map((row) => ({
      ...row,
      notes: row.notes ?? undefined,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItem> {
    const database = getDatabase();
    const id = randomUUID();
    const [row] = await database
      .insert(inventoryItems)
      .values({
        id,
        name: input.name,
        category: input.category,
        unit: input.unit,
        quantityOnHand: input.quantityOnHand,
        lowStockThreshold: input.lowStockThreshold,
        notes: input.notes,
      })
      .returning();
    return {
      id: row!.id,
      name: row!.name,
      category: row!.category,
      unit: row!.unit,
      quantityOnHand: row!.quantityOnHand,
      lowStockThreshold: row!.lowStockThreshold,
      notes: row!.notes ?? undefined,
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  async updateInventoryItem(
    id: string,
    input: UpdateInventoryItemInput,
  ): Promise<InventoryOutcome> {
    const database = getDatabase();
    const result = await database
      .update(inventoryItems)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning({ id: inventoryItems.id });
    if (result.length === 0) return { ok: false, reason: 'Inventory item not found' };
    return { ok: true };
  }

  async adjustStock(
    id: string,
    delta: number,
    reason: InventoryAdjustmentReason,
    itemId?: string,
  ): Promise<InventoryOutcome> {
    const database = getDatabase();
    return database.transaction(async (tx) => {
      const [current] = await tx
        .select({ quantityOnHand: inventoryItems.quantityOnHand })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, id));
      if (!current) return { ok: false, reason: 'Inventory item not found' };

      const newQuantity = current.quantityOnHand + delta;
      if (newQuantity < 0) {
        return { ok: false, reason: 'That would take stock below zero' };
      }

      await tx
        .update(inventoryItems)
        .set({ quantityOnHand: newQuantity, updatedAt: new Date() })
        .where(eq(inventoryItems.id, id));
      await tx.insert(inventoryAdjustments).values({
        id: randomUUID(),
        inventoryItemId: id,
        delta,
        reason,
        itemId,
      });
      return { ok: true };
    });
  }

  async deleteInventoryItem(id: string): Promise<InventoryOutcome> {
    const database = getDatabase();
    const result = await database
      .delete(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .returning({ id: inventoryItems.id });
    if (result.length === 0) return { ok: false, reason: 'Inventory item not found' };
    return { ok: true };
  }
}
