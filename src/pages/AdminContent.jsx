import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { TERMS_SECTIONS } from "@/pages/Terms";

// Single source of truth for what's editable here. Each field's fallback
// matches the default text hardcoded at its render site (Hero.jsx,
// Terms.jsx) — the fallback only ever shows before a field is customized,
// so a rendering-side wording tweak not mirrored here is cosmetic at worst,
// not a functional bug.
const FIELDS = [
  { group: "Landing page", key: "landing.hero.title_main", label: "Hero title — first line", fallback: "Move Anything." },
  { group: "Landing page", key: "landing.hero.title_highlight", label: "Hero title — highlighted line", fallback: "Anywhere in Zimbabwe." },
  { group: "Landing page", key: "landing.hero.subtitle", label: "Hero subtitle", fallback: "Quickly find trusted, verified transport providers for your goods. Post a request in minutes, compare offers from local drivers, and track your delivery every step of the way.", multiline: true },
  { group: "Landing page", key: "landing.hero.cta_customer", label: "\"Book Transport\" button", fallback: "Book Transport" },
  { group: "Landing page", key: "landing.hero.cta_driver", label: "\"Become a Driver\" button", fallback: "Become a Driver" },
  ...TERMS_SECTIONS.flatMap((s) => [
    { group: "Terms of Service", key: `${s.key}.title`, label: `${s.title} — heading`, fallback: s.title },
    { group: "Terms of Service", key: `${s.key}.body`, label: `${s.title} — body`, fallback: s.body, multiline: true },
  ]),
];

const GROUPS = [...new Set(FIELDS.map((f) => f.group))];

export default function AdminContent() {
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("site_content")
      .select("key, value")
      .then(({ data, error }) => {
        if (error) console.error("Failed to load site content:", error);
        const existing = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
        setValues(Object.fromEntries(FIELDS.map((f) => [f.key, existing[f.key] ?? f.fallback])));
      });
  }, []);

  const set = (key, v) => setValues((cur) => ({ ...cur, [key]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const rows = FIELDS.map((f) => ({ key: f.key, value: values[f.key], updated_at: new Date().toISOString() }));
      const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      toast({ title: "Content updated", description: "Changes are live immediately — no rebuild needed." });
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!values) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto pb-24">
      <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Site content</h1>
      <p className="text-sm text-muted-foreground mb-6">Edit landing page copy and Terms of Service text without a code change. Live on the site as soon as you save.</p>

      {GROUPS.map((group) => (
        <div key={group} className="mb-8">
          <h2 className="text-base font-semibold mb-3">{group}</h2>
          <div className="space-y-4">
            {FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={f.key} className="bg-white rounded-2xl border border-border p-4 space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                {f.multiline ? (
                  <Textarea id={f.key} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} rows={3} />
                ) : (
                  <Input id={f.key} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <Button onClick={save} disabled={saving} className="w-full h-12 font-semibold">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save changes</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
