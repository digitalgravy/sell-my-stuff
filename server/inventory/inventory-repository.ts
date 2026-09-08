export type InventoryCategory = 'bag' | 'wrap' | 'box' | 'tape' | 'label' | 'other';
export type InventoryUnit = 'each' | 'roll' | 'sheet' | 'metre';
export type InventoryAdjustmentReason = 'restock' | 'used_on_item' | 'correction';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  quantityOnHand: number;
  lowStockThreshold: number;
  notes?: string;
  updatedAt: string;
}

export interface CreateInventoryItemInput {
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  quantityOnHand: number;
  lowStockThreshold: number;
  notes?: string;
}

export interface UpdateInventoryItemInput {
  name?: string;
  category?: InventoryCategory;
  unit?: InventoryUnit;
  lowStockThreshold?: number;
  notes?: string;
}

export type InventoryOutcome = { ok: true } | { ok: false; reason: string };

export interface InventoryRepository {
  listInventory(): Promise<InventoryItem[]>;
  createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItem>;
  updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<InventoryOutcome>;
  /** Always logged to inventory_adjustments -- delta may be negative. Refuses a change that would take stock below zero. */
  adjustStock(
    id: string,
    delta: number,
    reason: InventoryAdjustmentReason,
    itemId?: string,
  ): Promise<InventoryOutcome>;
  deleteInventoryItem(id: string): Promise<InventoryOutcome>;
}
