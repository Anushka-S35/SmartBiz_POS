import React, { useCallback, useEffect, useState } from "react";
import {
  formatMinorUnits,
  hasPermission,
  localeTag,
  type CustomerRecord,
  type CustomerSalesSummary,
  type InvoiceRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";

const emptyCustomer = { name: "", phone: "", email: "", address: "" };

export default function CustomersScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [history, setHistory] = useState<InvoiceRecord[]>([]);
  const [summary, setSummary] = useState<CustomerSalesSummary | null>(null);
  const [currency, setCurrency] = useState({
    currencyCode: "INR",
    currencyFractionDigits: 2,
  });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyCustomer);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [selected, setSelected] = useState<CustomerRecord | null>(null);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [rows, currencySettings] = await Promise.all([
        app.listCustomers(user.id, search),
        app.getBillingCurrency(user.id),
      ]);
      setCustomers(rows);
      setCurrency(currencySettings);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCustomer = async (customer: CustomerRecord) => {
    if (!app || !user) return;
    setSelected(customer);
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    });
    try {
      const [purchaseHistory, salesSummary] = await Promise.all([
        app.getCustomerPurchaseHistory(user.id, customer.id),
        app.getCustomerSalesSummary(user.id, customer.id),
      ]);
      setHistory(purchaseHistory);
      setSummary(salesSummary);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  };

  const save = async () => {
    if (!app || !user) return;
    try {
      await app.saveCustomer(user.id, form, editing?.id);
      setEditing(null);
      setForm(emptyCustomer);
      await refresh();
    } catch (caught) {
      setError(caught);
    }
  };

  const archive = async (customer: CustomerRecord) => {
    if (!app || !user) return;
    try {
      await app.setCustomerArchived(user.id, customer.id, true);
      if (selected?.id === customer.id) setSelected(null);
      await refresh();
    } catch (caught) {
      setError(caught);
    }
  };

  const canManage = Boolean(
    user && hasPermission(user.role, "customers.manage"),
  );
  return (
    <Page>
      <Heading>Customers</Heading>
      {error ? <ErrorBanner>{errorText(error)}</ErrorBanner> : null}
      <Field
        label="Search customers"
        value={search}
        onChangeText={setSearch}
        placeholder="Name, phone or email"
      />
      {canManage ? (
        <Card>
          <Heading>{editing ? "Edit customer" : "Add customer"}</Heading>
          <Field
            label="Name"
            value={form.name}
            onChangeText={(name) =>
              setForm((current) => ({ ...current, name }))
            }
          />
          <Field
            label="Phone"
            value={form.phone}
            onChangeText={(phone) =>
              setForm((current) => ({ ...current, phone }))
            }
            keyboardType="phone-pad"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(email) =>
              setForm((current) => ({ ...current, email }))
            }
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Address"
            value={form.address}
            onChangeText={(address) =>
              setForm((current) => ({ ...current, address }))
            }
            multiline
          />
          <Button onPress={() => void save()} disabled={!form.name.trim()}>
            {editing ? "Save customer" : "Add customer"}
          </Button>
          {editing ? (
            <Button
              secondary
              onPress={() => {
                setEditing(null);
                setForm(emptyCustomer);
              }}
            >
              Clear form
            </Button>
          ) : null}
        </Card>
      ) : null}
      {customers.map((customer) => (
        <Card key={customer.id}>
          <Heading
            subtitle={[customer.phone, customer.email]
              .filter(Boolean)
              .join(" · ")}
          >
            {customer.name}
          </Heading>
          <Button secondary onPress={() => void openCustomer(customer)}>
            Purchase history
          </Button>
          {canManage ? (
            <Button danger onPress={() => void archive(customer)}>
              Archive customer
            </Button>
          ) : null}
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading subtitle={selected.name}>Purchase history</Heading>
          {summary ? (
            <Body>
              {summary.invoiceCount} completed invoices · Net sales{" "}
              {formatMinorUnits(
                summary.netSalesMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}{" "}
              · Paid{" "}
              {formatMinorUnits(
                summary.netPaidMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}{" "}
              · Outstanding{" "}
              {formatMinorUnits(
                summary.outstandingMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
            </Body>
          ) : null}
          {history.map((invoice) => (
            <Body key={invoice.id}>
              {invoice.invoiceNumber} · {invoice.status} ·{" "}
              {formatMinorUnits(
                invoice.totalMinor,
                currency.currencyCode,
                localeTag(locale),
                currency.currencyFractionDigits,
              )}
            </Body>
          ))}
          {history.length === 0 ? (
            <Body muted>No completed purchases yet.</Body>
          ) : null}
        </Card>
      ) : null}
    </Page>
  );
}
