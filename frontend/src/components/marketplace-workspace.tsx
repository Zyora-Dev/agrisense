"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Banknote, Check, ChevronLeft, ChevronRight, Droplets, FlaskConical, Leaf, LoaderCircle, MapPin, Menu, Package, Pencil, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Sprout, Store, Trash2, Truck, Upload, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Farm, Profile } from "@/lib/auth";
import type { ImageObservation } from "@/lib/vision";

const categories = [
  { id: "seeds", label: "Seeds", icon: Sprout, color: "bg-green-100 text-green-800" },
  { id: "fertilizers", label: "Fertilizers", icon: FlaskConical, color: "bg-amber-100 text-amber-900" },
  { id: "soil_care", label: "Soil care", icon: Leaf, color: "bg-rose-100 text-rose-900" },
  { id: "irrigation", label: "Irrigation", icon: Droplets, color: "bg-sky-100 text-sky-900" },
  { id: "crop_care", label: "Crop care", icon: ShieldCheck, color: "bg-teal-100 text-teal-900" },
];
const soils = ["sandy", "clay", "loamy", "silty", "peaty", "chalky", "mixed"];
type Product = { id: string; vendor_id: string; name: string; category: string; description: string; price_inr: string; unit: string; crops: string[]; soil_types: string[]; in_stock: boolean };
type Vendor = { id: string; name: string; location: string; description: string; contact_email: string; phone: string; is_active: boolean; is_demo: boolean; products: Product[] };
type Catalog = { items: Vendor[]; total: number; page: number; page_size: number };
type Advice = { summary: string; matches: { product_id: string; reason: string; precaution: string; product: Product; vendor: Pick<Vendor, "id" | "name" | "location" | "is_demo"> }[]; uses_simulated_data: boolean; image_included: boolean; disclaimer: string };
const selectStyle = "h-10 min-w-0 rounded-md border border-input bg-white px-3 text-sm text-zinc-900";
const money = (amount: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount));

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/marketplace/${path}`, { cache: "no-store", ...options });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.detail)
      ? data.detail.map((item: { loc: string[]; msg: string }) => `${item.loc.slice(1).join(".")}: ${item.msg}`).join("; ")
      : data.detail ?? data.error;
    throw new Error(message || "The request failed. Please try again.");
  }
  return data;
}
const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-zinc-200 ${className}`} />;
}

function ProductSummary({ product }: { product: Product }) {
  const category = categories.find((item) => item.id === product.category)!;
  const Icon = category.icon;
  return <div className="flex min-w-0 gap-3"><span className={`flex size-11 shrink-0 items-center justify-center rounded-md ${category.color}`}><Icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-zinc-950">{product.name}</p><p className="mt-1 text-sm text-zinc-700">{money(product.price_inr)} / {product.unit}</p><p className="mt-1 text-xs font-medium text-zinc-700">{category.label} · {product.in_stock ? "Listed as in stock" : "Out of stock"}</p></div></div>;
}

export function MarketplaceWorkspace({ profile, farms }: { profile: Profile; farms: Farm[] }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [own, setOwn] = useState<Vendor | null>(null);
  const [ownerLoaded, setOwnerLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [profileDialog, setProfileDialog] = useState(false);
  const [productDialog, setProductDialog] = useState<Product | "new" | null>(null);
  const [detail, setDetail] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [tab, setTab] = useState("browse");
  const [checkout, setCheckout] = useState<{ product: Product; vendor: Vendor; requestId: string } | null>(null);
  const [placedOrder, setPlacedOrder] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ query, page: String(page), page_size: "6" });
        if (category) params.set("category", category);
        const data = await api<Catalog>(`vendors?${params}`, { signal: controller.signal });
        setCatalog(data);
      } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [query, category, page, revision]);

  useEffect(() => {
    const controller = new AbortController();
    api<Vendor | null>("vendors/me", { signal: controller.signal }).then((vendor) => { setOwn(vendor); setOwnerLoaded(true); }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [revision]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      const payload = Object.fromEntries(["name", "location", "description", "contact_email", "phone"].map((key) => [key, data.get(key)]));
      await api(own ? "vendors/me" : "vendors", jsonRequest(own ? "PUT" : "POST", { ...payload, is_active: data.has("is_active") }));
      setRevision((value) => value + 1); setProfileDialog(false);
    } catch (failure) { setFormError((failure as Error).message); }
    finally { setSaving(false); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError("");
    const data = new FormData(event.currentTarget);
    const editing = productDialog !== "new" && productDialog;
    try {
      const payload = Object.fromEntries(["name", "category", "description", "price_inr", "unit"].map((key) => [key, data.get(key)]));
      await api(editing ? `products/${editing.id}` : "products", jsonRequest(editing ? "PUT" : "POST", {
        ...payload, crops: String(data.get("crops") || "").split(",").map((crop) => crop.trim()).filter(Boolean),
        soil_types: data.getAll("soil_types"), in_stock: data.has("in_stock"),
      }));
      setRevision((value) => value + 1); setProductDialog(null);
    } catch (failure) { setFormError((failure as Error).message); }
    finally { setSaving(false); }
  }

  async function removeProduct() {
    if (!deleting) return;
    setSaving(true); setFormError("");
    try { await api(`products/${deleting.id}`, { method: "DELETE" }); setDeleting(null); setRevision((value) => value + 1); }
    catch (failure) { setFormError((failure as Error).message); }
    finally { setSaving(false); }
  }

  async function openVendor(id: string) {
    try { setDetail(await api<Vendor>(`vendors/${id}`)); }
    catch (failure) { setError((failure as Error).message); }
  }

  const editing = productDialog && productDialog !== "new" ? productDialog : null;
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /></aside>
    <main className="min-w-0 flex-1">
      <header className="dashboard-header"><div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet><Brand /></div><h1 className="hidden text-xl font-semibold text-zinc-950 lg:block">Marketplace</h1><span className="ml-auto hidden max-w-48 truncate text-sm font-medium text-zinc-800 sm:block">{profile.full_name}</span></header>
      <div className="dashboard-content">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Farm supplies</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-3xl">Vendor marketplace</h2></div><Button disabled={!ownerLoaded} variant="outline" onClick={() => { setFormError(""); setProfileDialog(true); }}><Store className="size-4" />{own ? "Edit vendor profile" : "Become a vendor"}</Button></div>
        {error && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button className="ml-3" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>}
        {placedOrder && <p role="status" className="mt-5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">Order #{placedOrder.slice(0, 8)} was placed with cash on delivery.</p>}
        <Tabs value={tab} onValueChange={setTab} className="mt-7"><TabsList className="h-auto max-w-full flex-wrap justify-start"><TabsTrigger value="browse">All vendors</TabsTrigger><TabsTrigger value="orders">My orders</TabsTrigger><TabsTrigger value="shop">My vendor account</TabsTrigger>{own && <TabsTrigger value="sales">Vendor orders</TabsTrigger>}</TabsList>
          <TabsContent value="browse" className="mt-6 space-y-7">
            <section className="border-y border-green-200 bg-green-50/70 px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-4"><h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-950"><Sparkles className="size-5 text-green-700" />Farm-matched supplies</h3>{farms.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2"><Label htmlFor="match-farm">Farm</Label><select id="match-farm" className={`${selectStyle} max-w-full`} value={farmId} onChange={(event) => setFarmId(event.target.value)}>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>}</div>
              {farmId ? <FarmMatches key={farmId} farm={farms.find((farm) => farm.id === farmId)!} openVendor={openVendor} /> : <div className="mt-4"><p className="text-sm text-zinc-700">No farms registered.</p><Button asChild className="mt-3" variant="outline"><Link href="/farms"><Plus className="size-4" />Add farm</Link></Button></div>}
            </section>
            <section aria-label="Vendor catalog">
              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("query") || "")); setPage(1); }}><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 size-4 text-zinc-700" /><Input name="query" aria-label="Search vendors, products or location" placeholder="Search vendors, products or location" maxLength={100} className="h-10 pl-9" /></div><select aria-label="Category" className={selectStyle} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><Button type="submit" className="h-10"><Search className="size-4" />Search</Button></form>
              <div className="my-5 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-700"><span>{loading ? "Loading vendors..." : `${catalog?.total ?? 0} vendors`}</span><span>Five fictional demo vendors · Illustrative prices</span></div>
              {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-64 rounded-lg" />)}</div> : !catalog?.items.length ? <div className="border-y py-12 text-center"><Store className="mx-auto size-8 text-green-700" /><h3 className="mt-3 font-semibold text-zinc-950">No matching vendors</h3></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.items.map((vendor) => <article key={vendor.id} className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-lg font-semibold text-zinc-950">{vendor.name}</h3>{vendor.is_demo && <Badge variant="secondary">Demo</Badge>}</div><p className="mt-2 flex items-start gap-1 text-sm text-zinc-700"><MapPin className="mt-0.5 size-4 shrink-0" />{vendor.location}</p><p className="mt-3 line-clamp-2 break-words text-sm leading-6 text-zinc-700">{vendor.description}</p><div className="my-5 space-y-4 border-t pt-4">{vendor.products.filter((product) => !category || product.category === category).slice(0, 2).map((product) => <ProductSummary key={product.id} product={product} />)}{!vendor.products.length && <p className="text-sm text-zinc-700">No products listed yet.</p>}</div><Button variant="outline" className="mt-auto w-full" onClick={() => setDetail(vendor)}>View vendor<ChevronRight className="size-4" /></Button></article>)}</div>}
              {catalog && catalog.total > catalog.page_size && <div className="mt-6 flex items-center justify-center gap-4"><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><span className="text-sm text-zinc-700">Page {page} of {Math.ceil(catalog.total / catalog.page_size)}</span><Button variant="outline" size="icon" aria-label="Next page" disabled={page * catalog.page_size >= catalog.total || loading} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div>}
            </section>
          </TabsContent>
          <TabsContent value="orders" className="mt-6"><OrdersPanel role="buyer" revision={revision} browse={() => setTab("browse")} /></TabsContent>
          {own && <TabsContent value="sales" className="mt-6"><OrdersPanel role="vendor" revision={revision} /></TabsContent>}
          <TabsContent value="shop" className="mt-6">
            {!ownerLoaded ? <Skeleton className="h-44" /> : !own ? <section className="border-y py-12 text-center"><Store className="mx-auto size-8 text-green-700" /><h3 className="mt-4 text-lg font-semibold text-zinc-950">Your vendor profile</h3><Button className="mt-5" onClick={() => { setFormError(""); setProfileDialog(true); }}><Plus className="size-4" />Onboard vendor</Button></section> : <section><div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5"><div><h3 className="break-words text-xl font-semibold text-zinc-950">{own.name}</h3><p className="mt-1 text-sm text-zinc-700">{own.location} · {own.is_active ? "Published" : "Hidden from marketplace"} · {own.products.length}/30 products</p></div><Button disabled={own.products.length >= 30} onClick={() => { setFormError(""); setProductDialog("new"); }}><Plus className="size-4" />Add product</Button></div>{own.products.length === 0 && <p className="py-10 text-sm text-zinc-700">No products listed yet.</p>}<div className="divide-y">{own.products.map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><ProductSummary product={product} /><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={`Edit ${product.name}`} title="Edit product" onClick={() => { setFormError(""); setProductDialog(product); }}><Pencil className="size-4" /></Button><Button variant="outline" size="icon" aria-label={`Delete ${product.name}`} title="Delete product" onClick={() => { setFormError(""); setDeleting(product); }}><Trash2 className="size-4" /></Button></div></div>)}</div></section>}
          </TabsContent>
        </Tabs>
      </div>
    </main>

    <Dialog open={profileDialog} onOpenChange={(open) => { if (!saving) setProfileDialog(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{own ? "Edit vendor profile" : "Vendor onboarding"}</DialogTitle><DialogDescription>Contact details are public to signed-in farmers. Listings are vendor-provided, not verified endorsements.</DialogDescription></DialogHeader><form onSubmit={saveProfile} className="space-y-5"><Field name="name" label="Business name" value={own?.name} max={100} /><Field name="location" label="Location / service area" value={own?.location} max={200} /><TextField name="description" label="About your business" value={own?.description} /><Field name="contact_email" label="Public contact email" type="email" value={own?.contact_email} max={254} /><Field name="phone" label="Public phone" type="tel" value={own?.phone} max={30} /><label className="flex items-center gap-3 text-sm font-medium text-zinc-800"><input type="checkbox" name="is_active" defaultChecked={own?.is_active ?? true} className="size-4 accent-green-700" />Publish vendor profile</label>{formError && <p role="alert" className="text-sm text-red-800">{formError}</p>}<Button disabled={saving} type="submit" className="w-full">{saving && <LoaderCircle className="size-4 animate-spin" />}Save vendor</Button></form></DialogContent></Dialog>

    <Dialog open={productDialog !== null} onOpenChange={(open) => { if (!open && !saving) setProductDialog(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>List seed samples, fertilizers and agricultural supplies. Suitability details are vendor-declared.</DialogDescription></DialogHeader><form onSubmit={saveProduct} className="space-y-5"><Field name="name" label="Product name" value={editing?.name} max={100} /><div className="space-y-2"><Label htmlFor="product-category">Category</Label><select id="product-category" name="category" className={`${selectStyle} w-full`} defaultValue={editing?.category ?? "seeds"}>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><TextField name="description" label="Product details / sample specifications" value={editing?.description} /><div className="grid grid-cols-2 gap-4"><Field name="price_inr" label="Price (INR)" type="number" value={editing?.price_inr} /><Field name="unit" label="Pack / unit" value={editing?.unit} max={60} /></div><Field name="crops" label="Suitable crops (comma-separated)" value={editing?.crops.join(", ")} required={false} max={750} /><fieldset><legend className="mb-3 text-sm font-medium text-zinc-800">Soil suitability (optional)</legend><div className="grid grid-cols-2 gap-3">{soils.map((soil) => <label key={soil} className="flex items-center gap-2 text-sm capitalize text-zinc-800"><input type="checkbox" name="soil_types" value={soil} defaultChecked={editing?.soil_types.includes(soil)} className="size-4 accent-green-700" />{soil}</label>)}</div></fieldset><label className="flex items-center gap-3 text-sm font-medium text-zinc-800"><input type="checkbox" name="in_stock" defaultChecked={editing?.in_stock ?? true} className="size-4 accent-green-700" />In stock</label>{formError && <p role="alert" className="text-sm text-red-800">{formError}</p>}<Button disabled={saving} type="submit" className="w-full">{saving && <LoaderCircle className="size-4 animate-spin" />}Save product</Button></form></DialogContent></Dialog>

    <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle className="break-words">{detail?.name}</DialogTitle><DialogDescription>{detail?.location}{detail?.is_demo ? " · Fictional demo vendor" : " · Vendor-provided information"}</DialogDescription></DialogHeader>
      {detail && <><p className="break-words text-sm leading-6 text-zinc-700">{detail.description}</p>{detail.is_demo ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Demo listings cannot be purchased. Prices and availability are illustrative.</p> : <div className="space-y-2 border-y py-4 text-sm text-zinc-800"><p>Phone: <a className="break-all underline" href={`tel:${detail.phone.replace(/[^+\d]/g, "")}`}>{detail.phone}</a></p><p>Email: <a className="break-all underline" href={`mailto:${detail.contact_email}`}>{detail.contact_email}</a></p><p>Confirm stock, suitability and seller credentials before purchasing.</p></div>}
        <div className="divide-y">{detail.products.map((product) => <div key={product.id} className="py-4"><ProductSummary product={product} /><p className="mt-3 break-words text-sm leading-6 text-zinc-700">{product.description}</p><p className="mt-2 text-xs text-zinc-700">Crops: {product.crops.join(", ") || "Not specified"} · Soil: {product.soil_types.join(", ") || "Not specified"}</p>
          {!detail.is_demo && detail.id !== own?.id && <Button className="mt-4" disabled={!product.in_stock || !ownerLoaded} onClick={() => { setCheckout({ product, vendor: detail, requestId: crypto.randomUUID() }); setDetail(null); }}><ShoppingBag className="size-4" />Order with cash on delivery</Button>}
        </div>)}{!detail.products.length && <p className="py-4 text-sm text-zinc-700">No products listed.</p>}</div></>}
    </DialogContent></Dialog>
    {checkout && <OrderCheckout key={checkout.requestId} product={checkout.product} vendor={checkout.vendor} requestId={checkout.requestId} recipient={profile.full_name} close={() => setCheckout(null)} onPlaced={(order) => { setCheckout(null); setPlacedOrder(order.id); setRevision((value) => value + 1); setTab("orders"); }} />}
    <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete product?</DialogTitle><DialogDescription>{deleting?.name} will be removed from the catalog.</DialogDescription></DialogHeader>{formError && <p role="alert" className="text-sm text-red-800">{formError}</p>}<Button variant="destructive" disabled={saving} onClick={removeProduct}><Trash2 className="size-4" />Delete product</Button></DialogContent></Dialog>
  </div>;
}

type OrderStatus = "placed" | "confirmed" | "shipped" | "delivered" | "cancelled";
type Order = {
  id: string; vendor_name: string; vendor_phone: string; vendor_email: string; product_name: string;
  unit: string; unit_price_inr: string; quantity: number; total_inr: string;
  recipient_name: string; phone: string; address: string; city: string; postal_code: string;
  status: OrderStatus; payment_method: "cod"; payment_status: "pending" | "collected"; created_at: string;
};
type OrderPage = { items: Order[]; total: number; page: number; page_size: number };
const orderLabels: Record<OrderStatus, string> = { placed: "Awaiting confirmation", confirmed: "Confirmed", shipped: "Dispatched", delivered: "Delivered", cancelled: "Cancelled" };

function OrderCheckout({ product, vendor, requestId, recipient, close, onPlaced }: { product: Product; vendor: Vendor; requestId: string; recipient: string; close: () => void; onPlaced: (order: Order) => void }) {
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = (Math.round(Number(product.price_inr) * 100) * Number(quantity) / 100).toFixed(2);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const delivery = Object.fromEntries(["recipient_name", "phone", "address", "city", "postal_code"].map((key) => [key, data.get(key)]));
      const order = await api<Order>("orders", jsonRequest("POST", { ...delivery, request_id: requestId, product_id: product.id, quantity: Number(quantity), expected_price_inr: product.price_inr, payment_method: "cod" }));
      onPlaced(order);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Cash on delivery order</DialogTitle><DialogDescription>{vendor.name} · Subject to vendor confirmation of stock and delivery.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <ProductSummary product={product} />
        <div className="flex flex-wrap items-end justify-between gap-4 border-y py-4"><div className="w-24 space-y-2"><Label htmlFor="order-quantity">Quantity</Label><Input id="order-quantity" type="number" min={1} max={100} step={1} required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="text-right"><p className="text-sm text-zinc-700">Total payable on delivery</p><p className="mt-1 text-xl font-semibold text-zinc-950">{money(total)}</p></div></div>
        <Field name="recipient_name" label="Recipient name" value={recipient} max={100} />
        <Field name="phone" label="Delivery phone" type="tel" max={30} />
        <div className="space-y-2"><Label htmlFor="order-address">Delivery address</Label><textarea id="order-address" name="address" required minLength={10} maxLength={500} rows={3} className="w-full rounded-md border border-input bg-white p-3 text-sm text-zinc-900" /></div>
        <div className="grid grid-cols-2 gap-4"><Field name="city" label="City / town" max={100} /><div className="space-y-2"><Label htmlFor="order-postal">PIN code</Label><Input id="order-postal" name="postal_code" inputMode="numeric" pattern="[1-9][0-9]{5}" required minLength={6} maxLength={6} /></div></div>
        <fieldset className="space-y-2 border-t pt-4"><legend className="text-sm font-medium text-zinc-800">Payment method</legend><label className="flex items-center gap-3 text-sm text-zinc-900"><input type="radio" name="payment_method" value="cod" defaultChecked className="accent-green-700" /><Banknote className="size-5 text-green-700" />Cash on delivery</label></fieldset>
        <p className="text-sm leading-6 text-zinc-700">No online payment. No separate delivery fee is added. The vendor must confirm delivery at this total. Your name, phone and address will be shared with this vendor.</p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}{busy ? "Placing order..." : "Place COD order"}</Button>
    </form>
  </DialogContent></Dialog>;
}

function OrdersPanel({ role, revision, browse }: { role: "buyer" | "vendor"; revision: number; browse?: () => void }) {
  const [data, setData] = useState<OrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<{ order: Order; status: OrderStatus } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ role, page: String(page), page_size: "10" });
        if (status) params.set("status", status);
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);
        setData(await api<OrderPage>(`orders?${params}`, { signal: controller.signal }));
      } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [role, page, status, startDate, endDate, revision, refresh]);
  async function update() {
    if (!action) return;
    setBusy(true); setActionError("");
    try { await api(`orders/${action.order.id}`, jsonRequest("PUT", { status: action.status })); setAction(null); setRefresh((value) => value + 1); setPage(1); }
    catch (failure) { setActionError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function choose(order: Order, next: OrderStatus) { setActionError(""); setAction({ order, status: next }); }
  return <section className="space-y-5" aria-label={role === "buyer" ? "My orders" : "Vendor orders"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-semibold text-zinc-950">{role === "buyer" ? "My orders" : "Incoming orders"}</h3><Button variant="outline" size="sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor={`${role}-status`}>Status</Label><select id={`${role}-status`} className={`${selectStyle} w-full`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(orderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="min-w-0 space-y-2"><Label htmlFor={`${role}-from`}>From (UTC)</Label><Input id={`${role}-from`} type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></div><div className="min-w-0 space-y-2"><Label htmlFor={`${role}-to`}>To (UTC)</Label><Input id={`${role}-to`} type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></div></div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {loading ? <Skeleton className="h-56" /> : error ? null : !data?.items.length ? <div className="border-y py-12 text-center"><Package className="mx-auto size-8 text-green-700" /><p className="mt-4 font-medium text-zinc-900">No orders found</p>{browse && <Button variant="outline" className="mt-4" onClick={browse}><ShoppingBag className="size-4" />Browse vendors</Button>}</div> : <>
      <p className="text-sm text-zinc-700">{data.total} {data.total === 1 ? "order" : "orders"}</p>
      <div className="divide-y border-y">{data.items.map((order) => <article key={order.id} className="space-y-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-zinc-950">{order.product_name}</p><p className="mt-1 break-words text-sm text-zinc-700">{order.vendor_name} · #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString("en-IN")}</p></div><Badge variant="outline">{orderLabels[order.status]}</Badge></div>
        <div className="grid gap-4 text-sm text-zinc-800 md:grid-cols-3"><div><p>{order.quantity} × {order.unit} at {money(order.unit_price_inr)}</p><p className="mt-2 font-semibold text-zinc-950">Total {money(order.total_inr)}</p><p className="mt-2 flex items-center gap-2"><Banknote className="size-4 shrink-0 text-green-700" />{order.status === "cancelled" ? "COD cancelled · Nothing due" : order.payment_status === "collected" ? "COD collected (vendor-reported)" : "Cash due on delivery"}</p></div><div className="space-y-1"><p className="font-semibold text-zinc-900">Deliver to {order.recipient_name}</p><p className="whitespace-pre-wrap break-words">{order.address}</p><p className="break-words">{order.city} {order.postal_code}</p><a className="inline-block break-all underline" href={`tel:${order.phone.replace(/[^+\d]/g, "")}`}>{order.phone}</a></div><div className="space-y-1"><p className="font-semibold text-zinc-900">Vendor contact</p><a className="block break-all underline" href={`tel:${order.vendor_phone.replace(/[^+\d]/g, "")}`}>{order.vendor_phone}</a><a className="block break-all underline" href={`mailto:${order.vendor_email}`}>{order.vendor_email}</a></div></div>
        <div className="flex flex-wrap gap-2">{role === "vendor" && order.status === "placed" && <Button size="sm" onClick={() => choose(order, "confirmed")}><Check className="size-4" />Confirm order</Button>}{role === "vendor" && order.status === "confirmed" && <Button size="sm" onClick={() => choose(order, "shipped")}><Truck className="size-4" />Mark dispatched</Button>}{role === "vendor" && order.status === "shipped" && <Button size="sm" onClick={() => choose(order, "delivered")}><Banknote className="size-4" />Delivered / cash collected</Button>}{(order.status === "placed" || role === "vendor" && order.status === "confirmed") && <Button size="sm" variant="outline" onClick={() => choose(order, "cancelled")}><X className="size-4" />Cancel order</Button>}</div>
      </article>)}</div>
      {data.total > data.page_size && <div className="flex items-center justify-center gap-4"><Button variant="outline" size="icon" aria-label="Previous orders" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><span className="text-sm text-zinc-700">Page {page} of {Math.ceil(data.total / data.page_size)}</span><Button variant="outline" size="icon" aria-label="Next orders" disabled={page * data.page_size >= data.total} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div>}
    </>}
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{action?.status === "delivered" ? "Confirm delivery and cash collection?" : action?.status === "cancelled" ? "Cancel this order?" : action?.status === "confirmed" ? "Confirm this order?" : "Mark order dispatched?"}</DialogTitle><DialogDescription>{action?.status === "delivered" ? `Confirm the buyer received the order and you collected ${money(action.order.total_inr)} in cash. This action cannot be undone.` : action?.status === "confirmed" ? "Confirm stock and delivery to the recorded address at the agreed total, with no additional charges." : action?.status === "cancelled" ? "This order will be cancelled. No payment is due. This action cannot be undone." : "Confirm the order has been dispatched to the recorded delivery address."}</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-sm text-red-800">{actionError}</p>}<Button variant={action?.status === "cancelled" ? "destructive" : "default"} disabled={busy} onClick={update}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Confirm update</Button></DialogContent></Dialog>
  </section>;
}

function Field({ name, label, value, type = "text", required = true, max }: { name: string; label: string; value?: string; type?: string; required?: boolean; max?: number }) {
  return <div className="space-y-2"><Label htmlFor={`market-${name}`}>{label}</Label><Input id={`market-${name}`} name={name} type={type} defaultValue={value} required={required} maxLength={max} min={type === "number" ? 0 : undefined} max={type === "number" ? "99999999.99" : undefined} step={type === "number" ? "0.01" : undefined} /></div>;
}

function TextField({ name, label, value }: { name: string; label: string; value?: string }) {
  return <div className="space-y-2"><Label htmlFor={`market-${name}`}>{label}</Label><textarea id={`market-${name}`} name={name} defaultValue={value} required minLength={10} maxLength={1000} rows={3} className="w-full rounded-md border border-input bg-white p-3 text-sm text-zinc-900" /></div>;
}

function FarmMatches({ farm, openVendor }: { farm: Farm; openVendor: (id: string) => Promise<void> }) {
  const [image, setImage] = useState<ImageObservation | null>(null);
  const [imageName, setImageName] = useState("");
  const [preview, setPreview] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function upload(file: File) {
    setAnalyzing(true); setError(""); setAdvice(null); setImage(null); setImageName(""); setPreview("");
    const controller = lifetime.current;
    try {
      const { analyzeImage } = await import("@/lib/vision");
      const result = await analyzeImage(file, farm.id, "upload");
      if (controller?.signal.aborted) return;
      setImage(result.observation); setImageName(file.name); setPreview(URL.createObjectURL(file));
    } catch (failure) { if (!controller?.signal.aborted) setError((failure as Error).message); }
    finally { if (!controller?.signal.aborted) setAnalyzing(false); }
  }
  async function match() {
    setBusy(true); setError(""); setAdvice(null);
    const controller = lifetime.current;
    try { setAdvice(await api<Advice>(`farms/${farm.id}/recommendations`, { ...jsonRequest("POST", { image }), signal: controller?.signal })); }
    catch (failure) { if (!controller?.signal.aborted) setError((failure as Error).message); }
    finally { if (!controller?.signal.aborted) setBusy(false); }
  }

  return <div className="mt-4 space-y-4">
    <p className="text-sm text-zinc-800">{farm.location} · Recorded soil: <span className="font-semibold capitalize">{farm.soil_type ?? "Not recorded"}</span></p>
    <div className="flex flex-wrap gap-3"><input ref={fileInput} type="file" className="sr-only" aria-label="Crop health photo" accept="image/jpeg,image/png,image/webp" disabled={busy || analyzing} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /><Button variant="outline" disabled={busy || analyzing} onClick={() => fileInput.current?.click()}>{analyzing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}{analyzing ? "Analyzing photo..." : "Add crop photo"}</Button><Button disabled={busy || analyzing} onClick={match}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{busy ? "Matching supplies..." : "Find farm matches"}</Button></div>
    {image && <div className="flex items-start gap-3 border-t border-green-200 pt-4"><Image src={preview} alt="Uploaded crop" width={80} height={80} unoptimized className="size-20 rounded-md object-cover" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-zinc-900">{imageName}</p><p className="mt-1 text-sm text-zinc-800">{image.classifications[0].label}: {(image.classifications[0].confidence * 100).toFixed(1)}% model score</p><p className="mt-1 text-xs text-zinc-700">Unverified image observation, not a diagnosis.</p></div><Button variant="ghost" size="icon" aria-label="Remove crop photo" disabled={busy} onClick={() => { setImage(null); setPreview(""); setAdvice(null); }}><X className="size-4" /></Button></div>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {advice && <div className="border-t border-green-200 pt-5"><div className="mb-3 flex flex-wrap gap-2">{advice.uses_simulated_data && <Badge variant="secondary">Uses simulated readings</Badge>}<Badge variant="outline">{advice.image_included ? "Crop photo included" : "No crop photo included"}</Badge></div><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-900">{advice.summary}</p><div className="mt-4 divide-y divide-green-200">{advice.matches.map((item) => <div key={item.product_id} className="py-4"><ProductSummary product={item.product} /><p className="mt-3 text-sm font-semibold text-zinc-900">{item.vendor.name}{item.vendor.is_demo ? " · Demo vendor" : ""}</p><p className="mt-2 text-sm leading-6 text-zinc-800">{item.reason}</p><p className="mt-2 text-sm leading-6 text-amber-900">Precaution: {item.precaution}</p><Button className="mt-3" variant="outline" size="sm" onClick={() => openVendor(item.vendor.id)}>View vendor<ChevronRight className="size-4" /></Button></div>)}</div>{advice.matches.length === 0 && <p className="mt-4 text-sm font-medium text-zinc-800">No suitable catalog matches identified.</p>}<p className="mt-4 text-xs leading-5 text-zinc-700">{advice.disclaimer}</p></div>}
  </div>;
}