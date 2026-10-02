"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Cpu, Database, KeyRound, SlidersHorizontal, User, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/lib/store/app";

interface Health {
  providers: { id: string; label: string; enabled: boolean; model?: string }[];
  database: "connected" | "unconfigured" | "error";
}

const ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  "vision-service": "VISION_SERVICE_URL",
};

export default function SettingsPage() {
  const { settings, setSettings } = useApp();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader eyebrow="Settings" title="Studio settings" description="Tune the vision pipeline, connect AI providers and manage your workspace." />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><Cpu className="h-4 w-4 text-brand" /> AI vision engines</CardTitle>
            <CardDescription>Server-side providers are enabled with environment variables. Results are merged with the on-device pipeline.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EngineRow label="On-device CV" detail="Saliency segmentation · connected components · matting" status="on" />
          <EngineRow label="Tesseract OCR" detail="WASM, runs in your browser" status={settings.ocr ? "on" : "off"} />
          {(health?.providers ?? []).map((p) => (
            <EngineRow
              key={p.id}
              label={p.label}
              detail={p.enabled ? p.model ?? "Configured" : `Set ${ENV_KEYS[p.id]} to enable`}
              status={p.enabled ? (settings.cloud ? "on" : "off") : "missing"}
            />
          ))}
          {!health && <p className="text-sm text-muted-foreground">Checking provider status…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-brand" /> Pipeline</CardTitle>
            <CardDescription>Applies to new breakdowns.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow label="Text recognition (OCR)" hint="Read every line of text and estimate typography." checked={settings.ocr} onChange={(v) => setSettings({ ocr: v })} />
          <ToggleRow label="Inverted OCR pass" hint="Second pass for light text on dark backgrounds. Slower, more complete." checked={settings.ocrInvertPass} onChange={(v) => setSettings({ ocrInvertPass: v })} />
          <ToggleRow label="Use cloud vision providers" hint="Send a downscaled copy to configured providers for better labels and font matching." checked={settings.cloud} onChange={(v) => setSettings({ cloud: v })} />
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-white">Segmentation sensitivity</span>
              <span className="font-mono text-brand">{Math.round(settings.sensitivity * 100)}</span>
            </div>
            <Slider value={[settings.sensitivity]} min={0} max={1} step={0.05} onValueChange={([v]) => setSettings({ sensitivity: v })} />
            <p className="mt-2 text-xs text-muted-foreground">Higher finds fainter elements; lower keeps only strong foreground.</p>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-white">Maximum objects</span>
              <span className="font-mono text-brand">{settings.maxObjects}</span>
            </div>
            <Slider value={[settings.maxObjects]} min={4} max={30} step={1} onValueChange={([v]) => setSettings({ maxObjects: v })} />
          </div>
          <ToggleRow label="Reduce motion" hint="Minimise interface animations." checked={settings.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card id="profile">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-4 w-4 text-brand" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-xs text-muted-foreground">Display name</label>
            <Input value={settings.displayName} onChange={(e) => setSettings({ displayName: e.target.value })} />
          </CardContent>
        </Card>
        <Card id="workspace">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-brand" /> Workspace & storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-xs text-muted-foreground">Active workspace</label>
            <Input value={settings.workspace} onChange={(e) => setSettings({ workspace: e.target.value })} />
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3 text-sm">
              <span>PostgreSQL sync</span>
              {health?.database === "connected" ? (
                <Badge variant="success">Connected</Badge>
              ) : health?.database === "error" ? (
                <Badge variant="danger">Error</Badge>
              ) : (
                <Badge variant="secondary">Browser only</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Projects are always stored in this browser (IndexedDB). Set <code className="text-brand">DATABASE_URL</code> and run{" "}
              <code className="text-brand">npm run db:push</code> to also sync analyses to PostgreSQL.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand" /> Environment reference</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="scrollbar-thin overflow-x-auto rounded-xl bg-surface-sunken p-4 font-mono text-xs leading-relaxed text-slate-300">{`OPENAI_API_KEY=...        # OpenAI Vision
GEMINI_API_KEY=...        # Gemini Vision
ANTHROPIC_API_KEY=...     # Claude Vision
VISION_SERVICE_URL=...    # YOLO + SAM + rembg microservice (services/vision)
DATABASE_URL=postgresql://...`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

function EngineRow({ label, detail, status }: { label: string; detail: string; status: "on" | "off" | "missing" }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      {status === "on" ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
      ) : status === "off" ? (
        <XCircle className="h-5 w-5 text-slate-500" />
      ) : (
        <CircleDashed className="h-5 w-5 text-slate-500" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
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
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
