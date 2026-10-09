"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Download, HardDrive, Info, Palette, ShieldCheck, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ThemeSegmented } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BRAND } from "@/lib/brand";
import { useApp, useLibrary } from "@/lib/store/app";
import { createBackup, requestPersistence, restoreBackup, storageInfo, type StorageInfo } from "@/lib/store/backup";
import { clearAllProjects, storageErrorMessage } from "@/lib/store/db";
import { downloadBlob, formatBytes } from "@/lib/utils";

interface Health {
  providers: { id: string; label: string; enabled: boolean }[];
}

export default function SettingsPage() {
  const { settings, setSettings, clearExports, clearNotifications } = useApp();
  const { summaries, refresh } = useLibrary();
  const [providers, setProviders] = useState<Health["providers"]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStorage = useCallback(() => storageInfo().then(setStorage), []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: Health) => setProviders(h.providers.filter((p) => p.enabled)))
      .catch(() => setProviders([]));
    loadStorage();
  }, [loadStorage]);

  const exportBackup = async () => {
    setBusy("export");
    setMessage(null);
    try {
      const { blob, count } = await createBackup();
      downloadBlob(blob, `decon-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setMessage({ tone: "ok", text: `Backup downloaded with ${count} project${count === 1 ? "" : "s"}.` });
    } catch (e) {
      setMessage({ tone: "error", text: storageErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async (f?: File) => {
    if (!f) return;
    setBusy("import");
    setMessage(null);
    try {
      const { restored, skipped } = await restoreBackup(f);
      await refresh();
      await loadStorage();
      setMessage({
        tone: "ok",
        text: `Restored ${restored} project${restored === 1 ? "" : "s"}${skipped ? `; ${skipped} entr${skipped === 1 ? "y was" : "ies were"} unreadable and skipped` : ""}.`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: storageErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const deleteEverything = async () => {
    setBusy("delete");
    try {
      await clearAllProjects();
      clearExports();
      clearNotifications();
      await refresh();
      await loadStorage();
      setMessage({ tone: "ok", text: "All projects and history on this device were deleted." });
    } catch (e) {
      setMessage({ tone: "error", text: storageErrorMessage(e) });
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  };

  const keepSafe = async () => {
    const ok = await requestPersistence();
    await loadStorage();
    setMessage(
      ok
        ? { tone: "ok", text: "Your browser will now keep Decon's data even when storage runs low." }
        : { tone: "error", text: "Your browser declined. Some browsers only allow this for sites you visit often or have bookmarked." },
    );
  };

  const usedPct = storage?.usage != null && storage.quota ? (storage.usage / storage.quota) * 100 : 0;

  return (
    <div className="mx-auto max-w-[960px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader eyebrow="Settings" title="Settings" description="Appearance, processing options and the data stored on this device." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4 text-brand" /> Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-white">Theme</div>
              <div className="text-xs text-muted-foreground">Light, dark, or follow your device setting.</div>
            </div>
            <ThemeSegmented />
          </div>
          <ToggleRow label="Reduce motion" hint="Minimise interface animations." checked={settings.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-brand" /> Processing</CardTitle>
            <CardDescription>Applies to new breakdowns.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow label="Read text (OCR)" hint="Detect every line of text and estimate its typography." checked={settings.ocr} onChange={(v) => setSettings({ ocr: v })} />
          <ToggleRow
            label="Second pass for light text"
            hint="Finds light text on dark backgrounds more reliably. Takes a little longer."
            checked={settings.ocrInvertPass}
            onChange={(v) => setSettings({ ocrInvertPass: v })}
          />
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-white">Detection sensitivity</span>
              <span className="font-mono text-muted-foreground">{Math.round(settings.sensitivity * 100)}</span>
            </div>
            <Slider value={[settings.sensitivity]} min={0} max={1} step={0.05} onValueChange={([v]) => setSettings({ sensitivity: v })} aria-label="Detection sensitivity" />
            <p className="mt-2 text-xs text-muted-foreground">Higher finds fainter elements; lower keeps only strong shapes.</p>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-white">Maximum objects per design</span>
              <span className="font-mono text-muted-foreground">{settings.maxObjects}</span>
            </div>
            <Slider value={[settings.maxObjects]} min={4} max={30} step={1} onValueChange={([v]) => setSettings({ maxObjects: v })} aria-label="Maximum objects" />
          </div>
          {providers.length > 0 && (
            <div className="rounded-lg border border-white/[0.08] p-4">
              <ToggleRow
                label="Cloud vision (optional)"
                hint={`Sends a downscaled copy of each image to ${providers.map((p) => p.label).join(", ")} for better labels and font matching. Off by default.`}
                checked={settings.cloud}
                onChange={(v) => setSettings({ cloud: v })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="data">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-brand" /> Your data</CardTitle>
            <CardDescription>
              Projects are saved only in this browser on this device. Clearing your browsing data deletes them, so keep a backup.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-white/[0.08] p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-white"><HardDrive className="h-4 w-4 text-muted-foreground" /> Storage used</span>
              <span className="text-muted-foreground">
                {summaries.length} project{summaries.length === 1 ? "" : "s"}
                {storage?.usage != null && ` · ${formatBytes(storage.usage)}`}
                {storage?.quota ? ` of ${formatBytes(storage.quota)} available` : ""}
              </span>
            </div>
            {storage?.quota ? <Progress value={Math.max(usedPct, 0.5)} className="mt-3" /> : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                {storage?.persisted ? "Protected from automatic cleanup." : "Your browser may clear this data if the device runs low on space."}
              </span>
              {storage && !storage.persisted && storage.persisted !== null && (
                <Button variant="outline" size="sm" onClick={keepSafe}>Keep my data</Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportBackup} disabled={!!busy || summaries.length === 0}>
              <Download /> {busy === "export" ? "Preparing…" : "Export backup"}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              <Upload /> {busy === "import" ? "Restoring…" : "Restore from backup"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                importBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" className="text-rose-700 hover:text-rose-800 dark:text-rose-300 hover:dark:text-rose-200 sm:ml-auto" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
              <Trash2 /> Delete all data
            </Button>
          </div>

          {message && (
            <p
              role="status"
              className={
                message.tone === "ok"
                  ? "rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
                  : "rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
              }
            >
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Info className="h-4 w-4 text-brand" /> About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-white">{BRAND.name}</span> — {BRAND.tagline}. Breakdowns are automated estimates and work best on clean
            digital graphics; check results before reusing them.
          </p>
          <p className="flex gap-4">
            <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="text-brand hover:underline">Terms of Use</Link>
          </p>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Delete all data on this device?</DialogTitle>
          <DialogDescription className="mt-2">
            This permanently removes {summaries.length} project{summaries.length === 1 ? "" : "s"}, their extracted assets, your export history and
            notifications. Your settings and theme stay. This can&apos;t be undone — export a backup first if you might need them.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteEverything} disabled={busy === "delete"}>
              <Trash2 /> {busy === "delete" ? "Deleting…" : "Delete everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <div className="text-sm text-white">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
