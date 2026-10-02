// In-memory stand-in for the subset of supabase-js the server code uses.
// Mirrors PostgREST semantics that matter for correctness: `eq(col, null)`
// matches nothing, unique indexes reject duplicate inserts with 23505, and
// `.select()` after an update returns only the rows it changed.

export type Row = Record<string, unknown>;

export type DbState = {
  orders: Row[];
  order_items: Row[];
  payment_transactions: Row[];
  payment_webhook_events: Row[];
  decrementCalls: Array<{ productId: string; quantity: number; size: string | null }>;
  rpcCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  failOrderUpdates?: number;
  soldOut?: boolean;
  writes?: number;
};

const UNIQUE: Record<string, string[]> = {
  payment_webhook_events: ["provider_event_id"],
  payment_transactions: ["provider_checkout_id", "provider_event_id", "provider_payment_id"],
};

type Filter = (row: Row) => boolean;

class QueryBuilder {
  private operation: "select" | "insert" | "update" | null = null;
  private selected: string | null = null;
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;

  constructor(
    private readonly state: DbState,
    private readonly table: string,
  ) {}

  select(columns = "*") {
    this.operation = this.operation ?? "select";
    this.selected = columns;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => value !== null && row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  not(column: string, operator: "is", value: null) {
    if (operator !== "is" || value !== null) throw new Error("fake only supports not(col, 'is', null)");
    this.filters.push((row) => row[column] != null);
    return this;
  }

  gt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && (row[column] as string) > value);
    return this;
  }

  lt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && (row[column] as string) < value);
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: opts.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.max = n;
    return this;
  }

  maybeSingle() {
    return this.execute(true);
  }

  single() {
    return this.execute(true);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    const rows = (this.state as unknown as Record<string, Row[] | undefined>)[this.table];
    if (!rows) throw new Error(`unexpected table ${this.table}`);
    return rows;
  }

  private async execute(single: boolean): Promise<{ data: unknown; error: { code: string; message: string } | null }> {
    const rows = this.rows();

    if (this.operation === "insert") {
      const inserted: Row[] = [];
      for (const payload of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
        for (const column of UNIQUE[this.table] ?? []) {
          const value = payload[column];
          if (value != null && rows.some((row) => row[column] === value)) {
            return { data: null, error: { code: "23505", message: `duplicate key value (${column})` } };
          }
        }
        const row = {
          id: `${this.table}-${rows.length + 1}`,
          created_at: new Date().toISOString(),
          ...payload,
        };
        rows.push(row);
        inserted.push(row);
      }
      this.state.writes = (this.state.writes ?? 0) + 1;
      return { data: this.shape(inserted, single), error: null };
    }

    let matched = rows.filter((row) => this.filters.every((f) => f(row)));

    if (this.operation === "update") {
      if (this.table === "orders" && this.state.failOrderUpdates) {
        this.state.failOrderUpdates -= 1;
        return { data: null, error: { code: "57014", message: "statement timeout" } };
      }
      matched.forEach((row) => Object.assign(row, this.payload));
      if (matched.length) this.state.writes = (this.state.writes ?? 0) + 1;
      if (this.selected === null) return { data: null, error: null };
    }

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      matched = [...matched].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
    }
    if (this.max !== null) matched = matched.slice(0, this.max);
    return { data: this.shape(matched, single), error: null };
  }

  private shape(rows: Row[], single: boolean) {
    const projected = rows.map((row) => this.project(row));
    return single ? (projected[0] ?? null) : projected;
  }

  private project(row: Row) {
    if (!this.selected || this.selected === "*") return row;
    return Object.fromEntries(
      this.selected
        .split(",")
        .map((column) => column.trim())
        .map((column) => [column, row[column]]),
    );
  }
}

export function createFakeSupabase(state: DbState) {
  return {
    from(table: string) {
      return new QueryBuilder(state, table);
    },
    async rpc(name: string, args: Record<string, unknown> = {}) {
      (state.rpcCalls ??= []).push({ name, args });
      const orderId = args.p_order_id as string;
      if (name === "commit_order_stock") {
        const ok = !state.soldOut;
        if (ok) {
          for (const item of state.order_items.filter((i) => i.order_id === orderId)) {
            state.decrementCalls.push({
              productId: item.product_id as string,
              quantity: item.quantity as number,
              size: (item.size as string | null) ?? null,
            });
          }
        }
        return { data: ok, error: null };
      }
      if (name === "reserve_order_stock") return { data: !state.soldOut, error: null };
      if (name === "release_order_stock" || name === "release_expired_reservations") return { data: true, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

export function pendingOrderState(overrides: Partial<DbState> = {}): DbState {
  return {
    orders: [{ id: "order-1", status: "pending_payment", created_at: "2026-10-02T07:00:00.000Z" }],
    order_items: [{ order_id: "order-1", product_id: "product-1", size: "M", quantity: 1 }],
    payment_transactions: [
      {
        id: "tx-1",
        order_id: "order-1",
        provider: "yoco",
        provider_checkout_id: "checkout-1",
        provider_status: "created",
        paid_at: null,
        failed_at: null,
        created_at: "2026-10-02T07:00:00.000Z",
        raw_metadata_json: { redirectUrl: "https://pay.yoco.com/checkout-1" },
      },
    ],
    payment_webhook_events: [],
    decrementCalls: [],
    ...overrides,
  };
}
