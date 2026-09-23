import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Download, BookOpen, ExternalLink, Image as ImageIcon, Plus, Pencil, Trash2, Upload } from "lucide-react";
import PortalLayout from "../../components/portal/PortalLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const NAVY = "#0D1B2A";
const GOLD = "#C9A96E";

// Brand Guide (Google Drive shared document).
const BRAND_GUIDE_URL = "https://drive.google.com/file/d/1jhuZUp9dNtQxXiSRFRUlG952Z-qee0bR/view?usp=sharing";

// Always-shown baseline logo (managed assets appear after this in sort_order).
const LOGOS = [
  {
    label: "Primary Logo (PNG)",
    description: "Transparent background · 260×258",
    url: "https://media.base44.com/images/public/69aee092656fb9813439389b/389d00003_logoXd.png?v=logo2",
    filename: "the-100-collection-logo.png",
    background: "white",
    light: false,
  },
];

const EMPTY = { label: "", description: "", url: "", filename: "", background: "white", light: false, sort_order: 0 };

export default function Resources() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl mb-8" style={{ background: NAVY }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fff 0, transparent 40%)" }} />
          <div className="relative px-6 py-8 md:px-10 md:py-10">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              Partner Resources
            </span>
            <h1 className="text-3xl md:text-4xl mt-2 mb-3 text-white" style={{ fontFamily: "var(--font-serif)" }}>
              Brand Resources
            </h1>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl">
              Official logos and brand guidelines for The 100 Collection. Download what you need to proudly
              represent your membership across your website, social channels, and marketing materials.
            </p>
          </div>
        </div>

        {/* Logo downloads */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <ImageIcon className="w-5 h-5" style={{ color: NAVY }} />
            <h2 className="text-xl font-medium" style={{ color: NAVY, fontFamily: "var(--font-serif)" }}>
              The 100 Collection Logos
            </h2>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-2xl">
            The official marks. Right-click an image to save, or use the button under each logo to download the PNG file.
          </p>

          <LogoGrid isAdmin={isAdmin} />
        </div>

        {/* Brand guide */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5" style={{ color: NAVY }} />
            <h2 className="text-xl font-medium" style={{ color: NAVY, fontFamily: "var(--font-serif)" }}>
              Brand Guide
            </h2>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-2xl">
            Colors, typography, logo usage, and voice guidelines. Review before using our mark to keep
            everything consistent and on-brand.
          </p>
          <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: `${GOLD}1a` }}>
              <BookOpen className="w-7 h-7" style={{ color: GOLD }} />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              {BRAND_GUIDE_URL ? (
                <>
                  <div className="text-sm font-semibold text-slate-800 mb-1">View the Brand Guide</div>
                  <div className="text-xs text-slate-400 mb-4">Opens in a new tab</div>
                  <a
                    href={BRAND_GUIDE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#C9A96E] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#A68B4B] transition-colors"
                  >
                    Open Brand Guide <ExternalLink className="w-4 h-4" />
                  </a>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-800 mb-1">Brand Guide coming soon</div>
                  <div className="text-xs text-slate-400">We'll add the link here shortly.</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

function LogoGrid({ isAdmin }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmId, setConfirmId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { data: managed = [], isLoading } = useQuery({
    queryKey: ["brand-assets"],
    queryFn: () => base44.entities.BrandAsset.list("sort_order", 100),
  });

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const filename = form.filename || file.name;
      setForm((f) => ({ ...f, url: file_url, filename }));
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const sortedManaged = [...managed].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const logos = [...LOGOS, ...sortedManaged];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.BrandAsset.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-assets"] }); toast({ title: "Logo added" }); setOpen(false); },
    onError: (e) => toast({ title: "Could not add logo", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BrandAsset.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-assets"] }); toast({ title: "Logo updated" }); setOpen(false); },
    onError: (e) => toast({ title: "Could not update logo", description: e.message, variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.BrandAsset.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-assets"] }); toast({ title: "Logo removed" }); setConfirmId(null); },
    onError: (e) => toast({ title: "Could not remove logo", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (logo) => {
    setEditing(logo);
    setForm({
      label: logo.label || "",
      description: logo.description || "",
      url: logo.url || "",
      filename: logo.filename || "",
      background: logo.background || "white",
      light: !!logo.light,
      sort_order: logo.sort_order || 0,
    });
    setOpen(true);
  };
  const save = () => {
    if (!form.label.trim() || !form.url.trim() || !form.filename.trim()) {
      toast({ title: "Label, URL, and filename are required", variant: "destructive" });
      return;
    }
    if (editing) updateMut.mutate({ id: editing.id, data: form });
    else createMut.mutate(form);
  };

  return (
    <>
      {isAdmin && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600">Admin mode</span>
          <Button size="sm" onClick={openAdd} className="bg-[#0D1B2A] hover:bg-[#1a2e45]">
            <Plus className="w-4 h-4 mr-1" /> Add Logo
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {logos.map((logo, i) => (
          <div
            key={logo.id || `base-${i}`}
            className="flex flex-col items-center gap-4 bg-slate-50/70 rounded-xl border border-slate-100 p-6 text-center"
          >
            <div
              className="flex-shrink-0 rounded-xl border border-slate-200 p-4 flex items-center justify-center w-32 h-32"
              style={{ background: logo.light ? NAVY : logo.background }}
            >
              <img
                src={logo.url}
                alt="The 100 Collection"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="text-sm font-semibold text-slate-800 mb-1">{logo.label}</div>
              <div className="text-xs text-slate-400 mb-4">{logo.description}</div>
              <a
                href={logo.url}
                download={logo.filename}
                className="inline-flex items-center gap-2 bg-[#0D1B2A] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors"
              >
                <Download className="w-4 h-4" /> Download Logo
              </a>
              {isAdmin && logo.id && (
                <div className="flex items-center justify-center gap-4 mt-3">
                  <button onClick={() => openEdit(logo)} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => setConfirmId(logo.id)} className="text-xs text-rose-500 hover:text-rose-700 inline-flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isLoading && logos.length === 0 && (
        <div className="text-center text-xs text-slate-400 py-6">Loading logos…</div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit logo" : "Add a logo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Primary Logo (PNG)" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Transparent background · 260×258" />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <div className="flex gap-2">
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://media.base44.com/..." />
                <label className={`inline-flex items-center gap-1.5 shrink-0 text-sm font-medium px-3 rounded-xl border border-slate-200 ${uploading ? "opacity-60 cursor-wait bg-slate-100" : "cursor-pointer hover:bg-slate-50"}`}>
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">{uploading ? "Uploading…" : "Upload"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => onUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">Paste a URL or upload a PNG/JPG/SVG. Uploaded files are saved to your Base44 files.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Download filename</Label>
                <Input value={form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} placeholder="the-100-collection-logo.png" />
              </div>
              <div className="space-y-1.5">
                <Label>Preview background</Label>
                <Input value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} placeholder="white" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-slate-800">Light logo</div>
                <div className="text-xs text-slate-500">Show preview on a dark navy swatch</div>
              </div>
              <Switch checked={form.light} onCheckedChange={(v) => setForm({ ...form, light: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? "Saving…" : editing ? "Save changes" : "Add logo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this logo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">This removes the logo from the Resources page. It can be re-added later.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(confirmId)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}