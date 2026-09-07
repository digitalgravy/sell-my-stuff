export interface ItemsListRepository {
  /** Every item id regardless of status, most recently updated first. */
  listAllItemIds(): Promise<string[]>;
}
