"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type FieldArrayPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoLoader } from "@/components/logo-loader";
import { Enter } from "@/components/motion";
import { startAnalysis, ApiRequestError } from "@/lib/api";
import { getEntitlement } from "@/lib/data";
import { GOALS, GOAL_LABELS, LANGUAGES } from "@/lib/steps";

const formSchema = z.object({
  siteUrl: z
    .string()
    .min(1, "Site URL is required")
    .max(2048)
    .refine(
      (v) => {
        try {
          const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) ? v : `https://${v}`;
          const u = new URL(withScheme);
          return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password && u.hostname.includes(".");
        } catch {
          return false;
        }
      },
      { message: "Enter a valid http(s) website URL, e.g. https://example.com" },
    ),
  productName: z.string().trim().max(120).optional().or(z.literal("")),
  targetMarket: z.string().trim().max(120).optional().or(z.literal("")),
  knownCompetitors: z.array(z.string().trim().max(2048)).max(5),
  goal: z.enum(["first_customers", "grow_revenue", "improve_conversion", "enter_new_market", "beat_competitor"]),
  language: z.string().trim().min(2).max(40),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewAnalysisPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { data: ent } = useQuery({ queryKey: ["entitlement"], queryFn: getEntitlement });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      siteUrl: "",
      productName: "",
      targetMarket: "",
      knownCompetitors: [],
      goal: "first_customers",
      language: "English",
    },
  });
  // RHF's eager ArrayPath types exclude strictly-typed primitive arrays
  // (string[] resolves to never — still true in 7.89). Runtime is unaffected;
  // the double cast only satisfies the checker. Revisit if RHF fixes path types.
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "knownCompetitors" as unknown as FieldArrayPath<FormValues>,
  });
  const siteUrl = form.watch("siteUrl");

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const { jobId } = await startAnalysis({
        siteUrl: values.siteUrl,
        productName: values.productName || undefined,
        targetMarket: values.targetMarket || undefined,
        knownCompetitors: values.knownCompetitors.filter(Boolean),
        goal: values.goal,
        language: values.language,
      });
      toast.success("Analysis started");
      router.push(`/app/report/?id=${jobId}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === "not_subscribed") {
          toast.error(err.message, { description: "Redirecting you to billing…" });
          setTimeout(() => router.push("/app/billing/"), 1200);
          return;
        }
        if (err.code === "quota_exceeded") {
          toast.error(err.message, { description: "Redirecting you to billing…" });
          setTimeout(() => router.push("/app/billing/"), 1400);
          return;
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">New analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Point Olmene at the website that sells your product. The report takes a few minutes — you can
          close the tab, nothing is lost.
        </p>
      </div>

      {ent && !ent.active && ent.reportCredits === 0 && (
        <p className="mb-6 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
          You need an active subscription to run analyses.{" "}
          <a href="/app/billing/" className="font-semibold underline underline-offset-2">
            See plans
          </a>
          .
        </p>
      )}

      <Enter>
        <Card>
          <CardHeader>
            <CardTitle>What should we analyze?</CardTitle>
            <CardDescription>
              Everything except the URL is optional — but the more context, the sharper the report.
            </CardDescription>
          </CardHeader>
          <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="siteUrl">Website URL *</Label>
              <Input id="siteUrl" placeholder="https://yourproduct.com" {...form.register("siteUrl")} aria-invalid={!!form.formState.errors.siteUrl} />
              {form.formState.errors.siteUrl && (
                <p className="text-xs text-destructive">{form.formState.errors.siteUrl.message}</p>
              )}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="productName">Product name</Label>
                <Input id="productName" placeholder="Acme Analytics" {...form.register("productName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetMarket">Target market / country</Label>
                <Input id="targetMarket" placeholder="EU SaaS teams" {...form.register("targetMarket")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Main goal *</Label>
              <Select value={form.watch("goal")} onValueChange={(v) => form.setValue("goal", v as FormValues["goal"])}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose your main goal" />
                </SelectTrigger>
                <SelectContent>
                  {GOALS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Shapes the strategy section and the roadmap emphasis.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Report language</Label>
              <Select value={form.watch("language")} onValueChange={(v) => form.setValue("language", v)}>
                <SelectTrigger className="w-full" id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Known competitors</Label>
              <p className="text-xs text-muted-foreground">Up to 5 — names or URLs you already compare against.</p>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2">
                    <Input placeholder="competitor.com or Competitor Name" {...form.register(`knownCompetitors.${i}`)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove competitor">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {fields.length < 5 && (
                <Button type="button" variant="outline" size="sm" onClick={() => append("")}>
                  <Plus className="size-4" aria-hidden /> Add competitor
                </Button>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={submitting || !siteUrl}>
              {submitting ? (
                <>
                  <LogoLoader size={16} /> Starting analysis…
                </>
              ) : (
                "Start the analysis"
              )}
            </Button>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              We fetch your public pages, research your market with live web search, and analyze up to 5
              competitors. Usually 2–4 minutes.
            </p>
          </form>
          </CardContent>
        </Card>
      </Enter>
    </div>
  );
}
