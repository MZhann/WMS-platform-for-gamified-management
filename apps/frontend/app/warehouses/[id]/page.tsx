"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  warehouseApi,
  Warehouse,
  WarehouseFlowEntry,
  FlowItem,
  FlowOperation,
} from "@/lib/api";
import {
  ArrowLeft,
  PackagePlus,
  PackageMinus,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { InventoryCombobox } from "@/components/inventory-combobox";
import { useTranslation } from "react-i18next";

function parseFlowCsv(file: File): Promise<FlowItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "").trim();
      if (!text) {
        reject(new Error("CSV file is empty"));
        return;
      }
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) {
        reject(
          new Error("CSV must have a header row and at least one data row")
        );
        return;
      }
      const headerLine = lines[0];
      const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
      const typeIdx = headers.findIndex(
        (h) => h === "type" || h === "typename"
      );
      const countIdx = headers.findIndex(
        (h) => h === "count" || h === "quantity"
      );
      const priceIdx = headers.findIndex(
        (h) => h === "price" || h === "unitprice"
      );
      if (typeIdx === -1 || countIdx === -1) {
        reject(
          new Error(
            "CSV must have columns: type (or typeName) and count (or quantity)"
          )
        );
        return;
      }
      if (priceIdx === -1) {
        reject(new Error("CSV must have a price or unitPrice column"));
        return;
      }
      const items: FlowItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",").map((p) => p.trim());
        const typeName = (parts[typeIdx] ?? "").trim();
        if (!typeName) continue;
        const count = parseInt(parts[countIdx] ?? "0", 10);
        const unitPrice = parseFloat(parts[priceIdx] ?? "");
        if (!Number.isInteger(count) || count < 0) {
          reject(
            new Error(`Row ${i + 2}: count must be a non-negative integer`)
          );
          return;
        }
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          reject(
            new Error(`Row ${i + 2}: price must be a non-negative number`)
          );
          return;
        }
        items.push({ typeName, count, unitPrice });
      }
      if (items.length === 0) {
        reject(new Error("No valid rows found in CSV"));
        return;
      }
      resolve(items);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "utf-8");
  });
}

export default function WarehouseDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = params?.id as string;
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [flows, setFlows] = useState<WarehouseFlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [operationOpen, setOperationOpen] = useState(false);
  const [operationType, setOperationType] = useState<FlowOperation>("load");
  const [operationRows, setOperationRows] = useState<FlowItem[]>([
    { typeName: "", count: 0, unitPrice: 0 },
  ]);
  const [operationSubmitting, setOperationSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const loadWarehouse = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setNotFound(false);
      const [whRes, flowRes] = await Promise.all([
        warehouseApi.getOne(id),
        warehouseApi.getFlow(id, { limit: 20 }),
      ]);
      setWarehouse(whRes.warehouse);
      setFlows(flowRes.flows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("warehouses.failedToLoad");
      setError(msg);
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        setNotFound(true);
      }
      setWarehouse(null);
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWarehouse();
  }, [loadWarehouse]);

  const inventory = warehouse?.inventory ?? [];
  const existingTypeNames = Array.from(
    new Set(
      (warehouse?.inventory ?? []).map((i) => i.typeName.trim()).filter(Boolean)
    )
  ).sort();

  const addOperationRow = () => {
    setOperationRows((prev) => [
      ...prev,
      { typeName: "", count: 0, unitPrice: 0 },
    ]);
  };

  const updateOperationRow = (
    index: number,
    field: keyof FlowItem,
    value: string | number
  ) => {
    setOperationRows((prev) => {
      const next = [...prev];
      if (field === "count")
        next[index] = { ...next[index], count: Number(value) || 0 };
      else if (field === "unitPrice")
        next[index] = { ...next[index], unitPrice: Number(value) || 0 };
      else next[index] = { ...next[index], typeName: String(value) };
      return next;
    });
  };

  const removeOperationRow = (index: number) => {
    setOperationRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)
    );
  };

  const handleCsvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOperationError(null);
    try {
      const items = await parseFlowCsv(file);
      setOperationRows(items);
      setCsvFile(file);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "Invalid CSV");
    }
    e.target.value = "";
  };

  const canSubmitOperation =
    operationRows.length > 0 &&
    operationRows.every(
      (r) =>
        r.typeName.trim() !== "" &&
        Number.isInteger(r.count) &&
        r.count >= 0 &&
        typeof r.unitPrice === "number" &&
        !Number.isNaN(r.unitPrice) &&
        r.unitPrice >= 0
    );

  const handleSubmitOperation = async () => {
    if (!warehouse || !canSubmitOperation) return;
    const items: FlowItem[] = operationRows
      .filter((r) => r.typeName.trim() !== "")
      .map((r) => ({
        typeName: r.typeName.trim(),
        count: r.count,
        unitPrice: r.unitPrice,
      }));
    if (items.length === 0) return;
    setOperationSubmitting(true);
    setOperationError(null);
    try {
      const res = await warehouseApi.postFlow(warehouse.id, {
        operation: operationType,
        items,
      });
      setWarehouse(res.warehouse);
      setFlows((prev) => [res.flow, ...prev]);
      setOperationOpen(false);
      setOperationRows([{ typeName: "", count: 0, unitPrice: 0 }]);
      setCsvFile(null);
    } catch (e) {
      setOperationError(e instanceof Error ? e.message : t("warehouseDetail.operationFailed"));
    } finally {
      setOperationSubmitting(false);
    }
  };

  const openOperationModal = () => {
    setOperationRows([{ typeName: "", count: 0, unitPrice: 0 }]);
    setOperationError(null);
    setCsvFile(null);
    setOperationOpen(true);
  };

  const formatFlowDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
            <p className="text-muted-foreground">{t("warehouseDetail.loadingWarehouse")}</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (notFound || !warehouse) {
    return (
      <ProtectedRoute>
        <div className="p-6 lg:p-8">
          <Link
            href="/warehouses"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("warehouseDetail.backToWarehouses")}
          </Link>
          <div className="mt-8 rounded-lg border border-border bg-card p-12 text-center">
            <h2 className="text-lg font-semibold">{t("warehouseDetail.notFound")}</h2>
            <p className="mt-2 text-muted-foreground">
              {t("warehouseDetail.notFoundDesc")}
            </p>
            <Link
              href="/warehouses"
              className="mt-4 inline-block text-primary hover:underline"
            >
              {t("warehouseDetail.backToList")}
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const coords = warehouse.coordinates;
  const coordStr =
    coords?.length === 2
      ? `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
      : "—";

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        <Link
          href="/warehouses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("warehouseDetail.backToWarehouses")}
        </Link>

        <div className="mt-6">
          <h1 className="text-3xl font-bold tracking-tight">
            {warehouse.name}
          </h1>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("warehouseDetail.details")}</CardTitle>
            <CardDescription>{t("warehouseDetail.addressAndLocation")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{warehouse.description || t("warehouseDetail.noDescription")}</p>
            <p className="text-muted-foreground">{warehouse.address}</p>
            <p className="text-muted-foreground">{t("warehouseDetail.coordinates")}: {coordStr}</p>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{t("warehouseDetail.inventory")}</CardTitle>
              <CardDescription>{t("warehouseDetail.currentTypes")}</CardDescription>
            </div>
            <Button onClick={openOperationModal} size="sm">
              <PackagePlus className="mr-2 h-4 w-4" />
              {t("warehouseDetail.newOperation")}
            </Button>
          </CardHeader>
          <CardContent>
            {inventory.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                {t("warehouseDetail.noInventory")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("warehouseDetail.typeName")}</TableHead>
                    <TableHead className="text-right">{t("warehouseDetail.count")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((item, index) => (
                    <TableRow key={`${item.typeName}-${index}`}>
                      <TableCell className="font-medium">
                        {item.typeName}
                      </TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("warehouseDetail.operationHistory")}</CardTitle>
            <CardDescription>{t("warehouseDetail.loadUnloadOps")}</CardDescription>
          </CardHeader>
          <CardContent>
            {flows.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                {t("warehouseDetail.noOperations")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {flows.map((flow) => (
                  <li key={flow.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        {flow.operation === "load" ? (
                          <PackagePlus
                            className="h-5 w-5 text-green-600 dark:text-green-400"
                            aria-hidden
                          />
                        ) : (
                          <PackageMinus
                            className="h-5 w-5 text-destructive"
                            aria-hidden
                          />
                        )}
                        <span className="font-medium capitalize">
                          {flow.operation}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-sm">
                        {formatFlowDate(flow.createdAt)}
                      </span>
                    </div>
                    <ul className="mt-2 ml-7 list-none space-y-1 text-sm">
                      {flow.items.map((item, i) => (
                        <li key={`${item.typeName}-${i}`}>
                          {item.typeName}: {item.count}
                          {flow.operation === "load"
                            ? ` — ${t("warehouseDetail.cost")}: ${item.unitPrice}`
                            : ` — ${t("warehouseDetail.sell")}: ${item.unitPrice}`}
                          {" · "}
                          <span className="text-muted-foreground">
                            {t("warehouseDetail.total")}: {(item.count * item.unitPrice).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Dialog open={operationOpen} onOpenChange={setOperationOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("warehouseDetail.newOperation")}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {t("warehouseDetail.csvDescription")}{" "}
                <a
                  href="/example-flow.csv"
                  download="example-flow.csv"
                  className="text-primary underline hover:no-underline"
                >
                  {t("warehouseDetail.exampleCsv")}
                </a>
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{t("warehouseDetail.operationType")}</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="operation"
                      checked={operationType === "load"}
                      onChange={() => setOperationType("load")}
                      className="h-4 w-4"
                    />
                    {t("warehouseDetail.load")}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="operation"
                      checked={operationType === "unload"}
                      onChange={() => setOperationType("unload")}
                      className="h-4 w-4"
                    />
                    {t("warehouseDetail.unload")}
                  </label>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {t("warehouseDetail.itemsLabel", { priceLabel: operationType === "load" ? t("warehouseDetail.costPerUnit") : t("warehouseDetail.sellPricePerUnit") })}
                  </Label>
                  <div className="flex gap-2">
                    <input
                      id="flow-csv"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCsvSelect}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById("flow-csv")?.click()
                      }
                    >
                      <Upload className="mr-1 h-4 w-4" />
                      {t("warehouseDetail.uploadCsv")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addOperationRow}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t("warehouseDetail.addRow")}
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("warehouseDetail.typeName")}</TableHead>
                        <TableHead className="w-24">{t("warehouseDetail.count")}</TableHead>
                        <TableHead className="w-32">
                          {operationType === "load" ? t("warehouseDetail.costUnit") : t("warehouseDetail.sellUnit")}
                        </TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operationRows.map((row, index) => {
                        return (
                          <TableRow key={index}>
                            <TableCell className="align-top">
                              <InventoryCombobox
                                value={row.typeName}
                                onValueChange={(v) =>
                                  updateOperationRow(index, "typeName", v)
                                }
                                placeholder="Select product..."
                                className="h-8 w-full"
                                extraTypeNames={existingTypeNames}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                value={row.count || ""}
                                onChange={(e) =>
                                  updateOperationRow(
                                    index,
                                    "count",
                                    e.target.value
                                  )
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.unitPrice ?? ""}
                                onChange={(e) =>
                                  updateOperationRow(
                                    index,
                                    "unitPrice",
                                    e.target.value
                                  )
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeOperationRow(index)}
                                disabled={operationRows.length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {operationError && (
                  <p className="text-sm text-destructive">{operationError}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOperationOpen(false)}>
                {t("warehouseDetail.cancel")}
              </Button>
              <Button
                onClick={handleSubmitOperation}
                disabled={!canSubmitOperation || operationSubmitting}
              >
                {operationSubmitting ? t("warehouseDetail.submitting") : t("warehouseDetail.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
