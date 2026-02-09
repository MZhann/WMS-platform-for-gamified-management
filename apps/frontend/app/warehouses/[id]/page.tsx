"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const [activeTypeSuggestIndex, setActiveTypeSuggestIndex] = useState<
    number | null
  >(null);
  const typeSuggestBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const msg = e instanceof Error ? e.message : "Failed to load warehouse";
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

  const getTypeSuggestions = (query: string, limit = 8) => {
    const q = query.trim().toLowerCase();
    if (!q) return existingTypeNames.slice(0, limit);
    return existingTypeNames
      .filter((name) => name.toLowerCase().includes(q))
      .slice(0, limit);
  };

  const handleTypeInputFocus = (index: number) => {
    if (typeSuggestBlurRef.current) {
      clearTimeout(typeSuggestBlurRef.current);
      typeSuggestBlurRef.current = null;
    }
    setActiveTypeSuggestIndex(index);
  };

  const handleTypeInputBlur = () => {
    typeSuggestBlurRef.current = setTimeout(
      () => setActiveTypeSuggestIndex(null),
      200
    );
  };

  const handleSelectTypeSuggestion = (index: number, typeName: string) => {
    updateOperationRow(index, "typeName", typeName);
    setActiveTypeSuggestIndex(null);
  };

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
      setOperationError(e instanceof Error ? e.message : "Operation failed");
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
            <p className="text-muted-foreground">Loading warehouse...</p>
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
            Back to Warehouses
          </Link>
          <div className="mt-8 rounded-lg border border-border bg-card p-12 text-center">
            <h2 className="text-lg font-semibold">Warehouse not found</h2>
            <p className="mt-2 text-muted-foreground">
              The warehouse may have been deleted or you don&apos;t have access.
            </p>
            <Link
              href="/warehouses"
              className="mt-4 inline-block text-primary hover:underline"
            >
              Back to list
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
          Back to Warehouses
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
            <CardTitle>Details</CardTitle>
            <CardDescription>Address and location</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{warehouse.description || "No description"}</p>
            <p className="text-muted-foreground">{warehouse.address}</p>
            <p className="text-muted-foreground">Coordinates: {coordStr}</p>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>Current types and counts</CardDescription>
            </div>
            <Button onClick={openOperationModal} size="sm">
              <PackagePlus className="mr-2 h-4 w-4" />
              New operation
            </Button>
          </CardHeader>
          <CardContent>
            {inventory.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                No inventory yet. Record a load operation to add items.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type name</TableHead>
                    <TableHead className="text-right">Count</TableHead>
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
            <CardTitle>Operation history</CardTitle>
            <CardDescription>Load and unload operations</CardDescription>
          </CardHeader>
          <CardContent>
            {flows.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                No operations yet. Use &quot;New operation&quot; to load or
                unload items.
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
                            ? ` — cost: ${item.unitPrice}`
                            : ` — sell: ${item.unitPrice}`}
                          {" · "}
                          <span className="text-muted-foreground">
                            total: {(item.count * item.unitPrice).toFixed(2)}
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
              <DialogTitle>New operation</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Load adds items (with cost per unit). Unload removes items (with
                sell price per unit). CSV must have columns: type (or typeName),
                count (or quantity), price (or unitPrice). Example:{" "}
                <a
                  href="/example-flow.csv"
                  download="example-flow.csv"
                  className="text-primary underline hover:no-underline"
                >
                  example-flow.csv
                </a>
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Operation type</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="operation"
                      checked={operationType === "load"}
                      onChange={() => setOperationType("load")}
                      className="h-4 w-4"
                    />
                    Load
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="operation"
                      checked={operationType === "unload"}
                      onChange={() => setOperationType("unload")}
                      className="h-4 w-4"
                    />
                    Unload
                  </label>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Items (type, count,{" "}
                    {operationType === "load"
                      ? "cost per unit"
                      : "sell price per unit"}
                    )
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
                      Upload CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addOperationRow}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add row
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type name</TableHead>
                        <TableHead className="w-24">Count</TableHead>
                        <TableHead className="w-32">
                          {operationType === "load" ? "Cost/unit" : "Sell/unit"}
                        </TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operationRows.map((row, index) => {
                        const suggestions = getTypeSuggestions(row.typeName);
                        const showSuggest =
                          activeTypeSuggestIndex === index &&
                          suggestions.length > 0;
                        return (
                          <TableRow key={index}>
                            <TableCell className="relative align-top overflow-visible">
                              <div className="relative overflow-visible">
                                <Input
                                  value={row.typeName}
                                  onChange={(e) =>
                                    updateOperationRow(
                                      index,
                                      "typeName",
                                      e.target.value
                                    )
                                  }
                                  onFocus={() => handleTypeInputFocus(index)}
                                  onBlur={handleTypeInputBlur}
                                  placeholder="Type name or choose existing"
                                  className="h-8"
                                  autoComplete="off"
                                />
                                {showSuggest && (
                                  <ul
                                    className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-full overflow-y-auto overflow-x-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
                                    onMouseDown={(e) => e.preventDefault()}
                                  >
                                    {suggestions.map((name) => (
                                      <li
                                        key={name}
                                        role="option"
                                        className="cursor-pointer truncate px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                                        onMouseDown={() =>
                                          handleSelectTypeSuggestion(
                                            index,
                                            name
                                          )
                                        }
                                        title={name}
                                      >
                                        {name}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
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
                Cancel
              </Button>
              <Button
                onClick={handleSubmitOperation}
                disabled={!canSubmitOperation || operationSubmitting}
              >
                {operationSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
