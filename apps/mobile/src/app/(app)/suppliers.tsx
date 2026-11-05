import React, { useCallback, useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  formatMinorUnits,
  formatScaledQuantity,
  hasPermission,
  localeTag,
  type ProductRecord,
  type PurchaseRecord,
  type SupplierRecord,
  type SupplierBalanceRecord,
  type SupplierCreditRecord,
  type SupplierPaymentRecord,
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

const blank = { name: "", contactName: "", phone: "", email: "", address: "" };

export default function SuppliersScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [balances, setBalances] = useState<SupplierBalanceRecord[]>([]);
  const [credits, setCredits] = useState<SupplierCreditRecord[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [purchaseId, setPurchaseId] = useState("");
  const [purchaseLineId, setPurchaseLineId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnReason, setReturnReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER"
  >("CASH");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [form, setForm] = useState(blank);
  const [editingSupplier, setEditingSupplier] = useState<string | undefined>();
  const [referenceNumber, setReferenceNumber] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [lines, setLines] = useState<
    Array<{ productId: string; quantity: string; unitCost: string }>
  >([]);
  const [currency, setCurrency] = useState({
    currencyCode: "INR",
    currencyFractionDigits: 2,
  });
  const [error, setError] = useState<unknown>(null);
  const [requestKey, setRequestKey] = useState(
    () => `purchase:${Crypto.randomUUID()}`,
  );
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [
        supplierRows,
        productRows,
        purchaseRows,
        currencySettings,
        balanceRows,
        creditRows,
        paymentRows,
      ] = await Promise.all([
        app.listSuppliers(user.id),
        app.listProducts(user.id, { limit: 500 }),
        app.listPurchases(user.id, selectedSupplier || undefined),
        app.getBillingCurrency(user.id),
        app.getSupplierBalances(user.id),
        app.listSupplierCredits(user.id, selectedSupplier || undefined),
        app.listSupplierPayments(user.id, selectedSupplier || undefined),
      ]);
      setSuppliers(supplierRows);
      setProducts(productRows);
      setPurchases(purchaseRows);
      setCurrency(currencySettings);
      setBalances(balanceRows);
      setCredits(creditRows);
      setPayments(paymentRows);
      if (!purchaseRows.some((row) => row.id === purchaseId))
        setPurchaseId(purchaseRows[0]?.id ?? "");
      const currentPurchase =
        purchaseRows.find((row) => row.id === purchaseId) ?? purchaseRows[0];
      if (!currentPurchase?.lines.some((line) => line.id === purchaseLineId))
        setPurchaseLineId(currentPurchase?.lines[0]?.id ?? "");
      if (!supplierRows.some((item) => item.id === selectedSupplier))
        setSelectedSupplier(supplierRows[0]?.id ?? "");
      if (!productRows.some((item) => item.id === productId))
        setProductId(productRows[0]?.id ?? "");
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user, selectedSupplier, productId, purchaseId, purchaseLineId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSupplier = async () => {
    if (!app || !user) return;
    try {
      const saved = await app.saveSupplier(user.id, form, editingSupplier);
      setSelectedSupplier(saved.id);
      setForm(blank);
      setEditingSupplier(undefined);
      await refresh();
    } catch (caught) {
      setError(caught);
    }
  };

  const receive = async () => {
    if (!app || !user || !selectedSupplier || !lines.length) return;
    setSaving(true);
    setError(null);
    try {
      await app.receivePurchase(user.id, {
        supplierId: selectedSupplier,
        referenceNumber,
        idempotencyKey: requestKey,
        lines,
      });
      setRequestKey(`purchase:${Crypto.randomUUID()}`);
      setReferenceNumber("");
      setLines([]);
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  const issueCredit = async () => {
    if (!app || !user || !selectedSupplier || !purchaseId || !purchaseLineId)
      return;
    setSaving(true);
    setError(null);
    try {
      await app.createSupplierCredit(user.id, {
        supplierId: selectedSupplier,
        purchaseId,
        reason: returnReason,
        idempotencyKey: "supplier-credit:" + Crypto.randomUUID(),
        lines: [{ purchaseLineId, quantity: returnQuantity }],
      });
      setReturnReason("");
      setReturnQuantity("1");
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };
  const settle = async () => {
    if (!app || !user || !selectedSupplier) return;
    setSaving(true);
    setError(null);
    try {
      await app.recordSupplierPayment(user.id, {
        supplierId: selectedSupplier,
        amount: paymentAmount,
        method: paymentMethod,
        reference: paymentReference,
        idempotencyKey: "supplier-payment:" + Crypto.randomUUID(),
      });
      setPaymentAmount("");
      setPaymentReference("");
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };
  const selectedPurchase = purchases.find((row) => row.id === purchaseId);
  const selectedBalance = balances.find(
    (row) => row.supplierId === selectedSupplier,
  );
  const canManage = Boolean(
    user && hasPermission(user.role, "purchasing.manage"),
  );
  const selectedProduct = products.find((item) => item.id === productId);
  return (
    <Page>
      <Heading subtitle="Supplier contacts and received purchase history">
        Suppliers & purchases
      </Heading>
      {error ? <ErrorBanner>{errorText(error)}</ErrorBanner> : null}
      {canManage ? (
        <Card>
          <Heading>
            {editingSupplier ? "Edit supplier" : "Add supplier"}
          </Heading>
          <Field
            label="Supplier name"
            value={form.name}
            onChangeText={(name) => setForm((s) => ({ ...s, name }))}
          />
          <Field
            label="Contact name"
            value={form.contactName}
            onChangeText={(contactName) =>
              setForm((s) => ({ ...s, contactName }))
            }
          />
          <Field
            label="Phone"
            value={form.phone}
            onChangeText={(phone) => setForm((s) => ({ ...s, phone }))}
            keyboardType="phone-pad"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(email) => setForm((s) => ({ ...s, email }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Address"
            value={form.address}
            onChangeText={(address) => setForm((s) => ({ ...s, address }))}
            multiline
          />
          <Button
            onPress={() => void saveSupplier()}
            disabled={!form.name.trim()}
          >
            {editingSupplier ? "Save changes" : "Save supplier"}
          </Button>
          {editingSupplier ? (
            <Button
              secondary
              onPress={() => {
                setEditingSupplier(undefined);
                setForm(blank);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Heading>Supplier list</Heading>
        {suppliers.map((supplier) => (
          <Button
            key={supplier.id}
            secondary
            onPress={() => setSelectedSupplier(supplier.id)}
          >
            {selectedSupplier === supplier.id ? "✓ " : ""}
            {supplier.name}
            {supplier.phone ? ` · ${supplier.phone}` : ""}
          </Button>
        ))}
        {!suppliers.length ? <Body muted>No suppliers added.</Body> : null}
        {canManage && suppliers.find((item) => item.id === selectedSupplier) ? (
          <>
            <Button
              secondary
              onPress={() => {
                const item = suppliers.find(
                  (row) => row.id === selectedSupplier,
                )!;
                setForm({
                  name: item.name,
                  contactName: item.contactName,
                  phone: item.phone,
                  email: item.email,
                  address: item.address,
                });
                setEditingSupplier(item.id);
              }}
            >
              Edit selected supplier
            </Button>
            <Button
              danger
              onPress={() => {
                if (app && user)
                  void app
                    .archiveSupplier(user.id, selectedSupplier)
                    .then(() => {
                      setSelectedSupplier("");
                      void refresh();
                    })
                    .catch(setError);
              }}
            >
              Archive selected supplier
            </Button>
          </>
        ) : null}
      </Card>
      {canManage && suppliers.length ? (
        <Card>
          <Heading>Receive purchase</Heading>
          <Field
            label="Purchase reference"
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            placeholder="Supplier invoice or receipt number"
          />
          {products.length ? (
            <Choice
              selected={productId}
              onSelect={setProductId}
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.sku}`,
              }))}
            />
          ) : (
            <Body muted>Add an active product before receiving stock.</Body>
          )}
          {selectedProduct ? (
            <Body muted>Quantity in {selectedProduct.unitName}</Body>
          ) : null}
          <Field
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
          />
          <Field
            label="Unit cost"
            value={unitCost}
            onChangeText={setUnitCost}
            keyboardType="decimal-pad"
          />
          <Button
            secondary
            disabled={!selectedProduct || !quantity || !unitCost}
            onPress={() => {
              if (productId && selectedProduct) {
                setLines((current) => [
                  ...current,
                  { productId, quantity, unitCost },
                ]);
                setQuantity("1");
                setUnitCost("");
              }
            }}
          >
            Add product to receipt
          </Button>
          {lines.map((line, index) => {
            const product = products.find((item) => item.id === line.productId);
            return (
              <Body key={`${line.productId}-${index}`}>
                {product?.name} · {line.quantity} · {line.unitCost}
              </Body>
            );
          })}
          <Button
            onPress={() => void receive()}
            disabled={
              saving ||
              !selectedSupplier ||
              !referenceNumber.trim() ||
              !lines.length
            }
          >
            Confirm receipt and add stock
          </Button>
        </Card>
      ) : null}
      {selectedSupplier ? (
        <Card>
          <Heading
            subtitle={
              selectedBalance
                ? "Outstanding " +
                  formatMinorUnits(
                    selectedBalance.outstandingMinor,
                    currency.currencyCode,
                    localeTag(locale),
                    currency.currencyFractionDigits,
                  )
                : "No balance record"
            }
          >
            Supplier balance and settlement
          </Heading>
          {selectedBalance ? (
            <Body>
              Purchases{" "}
              {formatMinorUnits(
                selectedBalance.purchasesMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}{" "}
              · Credits{" "}
              {formatMinorUnits(
                selectedBalance.creditsMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}{" "}
              · Paid{" "}
              {formatMinorUnits(
                selectedBalance.paymentsMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
            </Body>
          ) : null}
          {canManage ? (
            <>
              <Field
                label="Payment amount"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
              />
              <Choice
                selected={paymentMethod}
                onSelect={(v) => setPaymentMethod(v as typeof paymentMethod)}
                options={[
                  { value: "CASH", label: "Cash" },
                  { value: "UPI", label: "UPI" },
                  { value: "CARD", label: "Card" },
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
              <Field
                label="Payment reference"
                value={paymentReference}
                onChangeText={setPaymentReference}
              />
              <Button
                onPress={() => void settle()}
                disabled={saving || !paymentAmount}
              >
                Record supplier payment
              </Button>
              <Heading>Return items from purchase</Heading>
              <Choice
                selected={purchaseId}
                onSelect={setPurchaseId}
                options={purchases.map((row) => ({
                  value: row.id,
                  label:
                    row.referenceNumber +
                    " · " +
                    new Date(row.createdAt).toLocaleDateString(
                      localeTag(locale),
                    ),
                }))}
              />
              <Choice
                selected={purchaseLineId}
                onSelect={setPurchaseLineId}
                options={(selectedPurchase?.lines ?? []).map((line) => ({
                  value: line.id,
                  label:
                    line.productName +
                    " · " +
                    line.quantityScaled +
                    " received",
                }))}
              />
              <Field
                label="Return quantity"
                value={returnQuantity}
                onChangeText={setReturnQuantity}
                keyboardType="decimal-pad"
              />
              <Field
                label="Return reason"
                value={returnReason}
                onChangeText={setReturnReason}
              />
              <Button
                danger
                onPress={() => void issueCredit()}
                disabled={saving || !purchaseLineId || !returnReason.trim()}
              >
                Issue supplier credit and return stock
              </Button>
            </>
          ) : null}
          <Heading>Supplier credits</Heading>
          {credits.map((row) => (
            <Body key={row.id}>
              {row.reason} ·{" "}
              {formatMinorUnits(
                row.creditMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
            </Body>
          ))}
          <Heading>Payment ledger</Heading>
          {payments.map((row) => (
            <Body key={row.id}>
              {new Date(row.occurredAt).toLocaleDateString(localeTag(locale))} ·{" "}
              {row.method} ·{" "}
              {formatMinorUnits(
                row.amountMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
              {row.reference ? " · " + row.reference : ""}
            </Body>
          ))}
        </Card>
      ) : null}
      {purchases.map((purchase) => (
        <Card key={purchase.id}>
          <Heading
            subtitle={`${purchase.supplierName} · ${purchase.referenceNumber}`}
          >
            {new Date(purchase.createdAt).toLocaleString(localeTag(locale))}
          </Heading>
          {purchase.lines.map((line, index) => (
            <Body key={`${line.productId}-${index}`}>
              {line.productName} ·{" "}
              {formatScaledQuantity(
                line.quantityScaled,
                products.find((p) => p.id === line.productId)?.unitPrecision ??
                  0,
              )}{" "}
              ·{" "}
              {formatMinorUnits(
                line.lineTotalMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
            </Body>
          ))}
          <Body>
            Total{" "}
            {formatMinorUnits(
              purchase.totalMinor,
              currency.currencyCode,
              localeTag(locale),
              currency.currencyFractionDigits,
            )}
          </Body>
        </Card>
      ))}
    </Page>
  );
}
