import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProducts, Product } from "../lib/api";
import { supabase } from "../lib/supabase";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchProducts();
      if (!mountedRef.current) return;
      setProducts(data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Realtime stock updates via Supabase Realtime.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("products-stock")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        (payload) => {
          const updated = payload.new as Product;
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
        },
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, []);

  return { products, loading, error, reload: load };
}
