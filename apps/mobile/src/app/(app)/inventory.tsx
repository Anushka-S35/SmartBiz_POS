import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  formatScaledQuantity,
  hasPermission,
  type StockBalanceRecord,
  type StockMovementRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  Choice,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";

type MovementChoice =
  "OPENING" | "PURCHASE_IN" | "MANUAL_OUT" | "PURCHASE_RETURN" | "ADJUSTMENT";

export default function InventoryScreen(): React.JSX.Element {
  const { app, user, errorText } = useApp();
  const [balances, setBalances] = useState<StockBalanceRecord[]>([]);
  const [history, setHistory] = useState<StockMovementRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [movementType, setMovementType] =
    useState<MovementChoice>("PURCHASE_IN");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [requestKey, setRequestKey] = useState(
    () => `stock:${Crypto.randomUUID()}`,
  );

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [rows, movements] = await Promise.all([
        app.listStockBalances(user.id, { search }),
        selectedProductId
          ? app.listStockMovements(user.id, selectedProductId)
          : Promise.resolve([]),
      ]);
      setBalances(rows);
      setHistory(movements);
      if (!rows.some((row) => row.productId === selectedProductId)) {
        setSelectedProductId(rows[0]?.productId ?? "");
      }
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user, search, selectedProductId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedProduct = useMemo(
    () => balances.find((item) => item.productId === selectedProductId),
    [balances, selectedProductId],
  );

  const recordMovement = async () => {
    if (!app || !user || !selectedProduct) return;
    setSaving(true);
    setError(null);
    try {
      await app.recordStockMovement(user.id, {
        productId: selectedProduct.productId,
        movementType,
        quantity,
        ...(unitCost ? { unitCost } : {}),
        reason,
        idempotencyKey: requestKey,
      });
      setRequestKey(`stock:${Crypto.randomUUID()}`);
      setQuantity("");
      setUnitCost("");
      setReason("");
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  const canManage = Boolean(
    user && hasPermission(user.role, "inventory.manage"),
  );
  const lowStockCount = balances.filter((item) => item.lowStock).length;

  return (
    <Page>
      <Heading
        subtitle={`${lowStockCount} low-stock item${lowStockCount === 1 ? "" : "s"}`}
      >
        Inventory
      </Heading>
      {error ? <ErrorBanner>{errorText(error)}</ErrorBanner> : null}
      <Field
        label="Search products"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, SKU or barcode"
      />
      {balances.map((item) => (
        <Card key={item.productId}>
          <Heading
            subtitle={`${item.sku} · reorder at ${formatScaledQuantity(item.reorderThresholdScaled, item.unitPrecision)} ${item.unitName}`}
          >
            {item.productName}
          </Heading>
          <Body>
            {formatScaledQuantity(item.onHandScaled, item.unitPrecision)}{" "}
            {item.unitName} on hand{item.lowStock ? " · Low stock" : ""}
          </Body>
          <Button
            secondary
            onPress={() => setSelectedProductId(item.productId)}
          >
            {selectedProductId === item.productId
              ? "Showing stock history"
              : "View stock history"}
          </Button>
        </Card>
      ))}
      {canManage && selectedProduct ? (
        <Card>
          <Heading>Record stock movement</Heading>
          <Body muted>{selectedProduct.productName}</Body>
          <Choice
            selected={movementType}
            onSelect={(value) => setMovementType(value as MovementChoice)}
            options={[
              { value: "OPENING", label: "Opening stock" },
              { value: "PURCHASE_IN", label: "Stock IN" },
              { value: "MANUAL_OUT", label: "Stock OUT" },
              { value: "PURCHASE_RETURN", label: "Purchase return" },
              { value: "ADJUSTMENT", label: "Adjustment" },
            ]}
          />
          <Field
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            placeholder={
              movementType === "ADJUSTMENT"
                ? "Use a minus sign to reduce stock"
                : "Quantity"
            }
            keyboardType="decimal-pad"
          />
          {movementType === "PURCHASE_IN" ? (
            <Field
              label="Unit cost (optional)"
              value={unitCost}
              onChangeText={setUnitCost}
              keyboardType="decimal-pad"
            />
          ) : null}
          <Field
            label="Reason / reference"
            value={reason}
            onChangeText={setReason}
            placeholder="Required for the stock audit trail"
          />
          <Button
            onPress={() => void recordMovement()}
            disabled={saving || !quantity || !reason}
          >
            {saving ? "Saving..." : "Record movement"}
          </Button>
        </Card>
      ) : null}
      {selectedProduct ? (
        <Card>
          <Heading>Stock history · {selectedProduct.productName}</Heading>
          {history.map((movement) => (
            <Body key={movement.id}>
              {movement.occurredAt} · {movement.movementType} ·{" "}
              {movement.quantityDeltaScaled > 0 ? "+" : ""}
              {formatScaledQuantity(
                Math.abs(movement.quantityDeltaScaled),
                selectedProduct.unitPrecision,
              )}{" "}
              · {movement.reason}
            </Body>
          ))}
          {history.length === 0 ? (
            <Body muted>No stock movements recorded.</Body>
          ) : null}
        </Card>
      ) : null}
    </Page>
  );
}
