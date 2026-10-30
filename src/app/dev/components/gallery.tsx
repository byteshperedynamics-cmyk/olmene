"use client";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Flower } from "@/components/v2/flower";
import { ConfidenceBar, Eyebrow, ExampleBadge, LivePill, ProductFrame } from "@/components/v2/atoms";
import { CountUp } from "@/components/v2/count-up";
import { ScanPreview } from "@/components/v2/scan-preview";
import { StepRail } from "@/components/v2/step-rail";
import { DiffView } from "@/components/v2/diff-view";
import { ConnectDiagram, FixFeed, ImpactChart, KpiTile, MergeRing, MetricBars } from "@/components/v2/data-viz";
import { InView } from "@/components/v2/in-view";
import { ConnectPanel } from "@/components/v2/agent/connect-panel";
import { AppTopBar } from "@/components/app-header";
import { SAMPLE_DIFF, SAMPLE_FEED, SAMPLE_MRR_WEEKS, sampleClickSeries } from "@/lib/v2/sample-data";

function Cell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 border-t py-8">
      <p className="font-mono text-xs text-faint">{name}</p>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function ComponentGallery() {
  const series = sampleClickSeries();
  return (
    <main className="o-grid-bg min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>Dev only</Eyebrow>
            <h1 className="o-display mt-2 text-4xl">v2 component gallery</h1>
          </div>
          <ThemeToggle />
        </div>

        <Cell name="AppTopBar · signed-in top bar below lg (the drawer holds the navigation)">
          <div className="overflow-hidden rounded-xl border">
            <AppTopBar pathname="/app/billing/" identity={null} onSignOut={() => {}} />
          </div>
        </Cell>

        <Cell name="Flower · static / breathe / bloom / bloom-once">
          <div className="flex items-center gap-8">
            <Flower size={40} />
            <Flower size={40} variant="breathe" />
            <Flower size={40} variant="bloom" />
            <Flower size={40} variant="bloom-once" />
          </div>
        </Cell>

        <Cell name="LivePill · ExampleBadge · Eyebrow">
          <div className="flex flex-wrap items-center gap-3">
            <LivePill tone="live">Agent live · 1,284 fixes shipped</LivePill>
            <LivePill tone="neutral">medium</LivePill>
            <LivePill tone="problem">high impact</LivePill>
            <LivePill tone="ok">merged</LivePill>
            <ExampleBadge label="example data" />
            <Eyebrow>Section label</Eyebrow>
          </div>
        </Cell>

        <Cell name="Button · sheen / hairline / default / outline">
          <div className="flex flex-wrap gap-3">
            <Button variant="sheen" size="xl">Scan my site</Button>
            <Button variant="hairline" size="xl">Skip for now</Button>
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
          </div>
        </Cell>

        <Cell name="GlowBorder">
          <div className="o-glow-border max-w-xs rounded-xl p-5">
            <p className="o-display text-xl">Fix</p>
            <p className="o-display text-4xl">€49</p>
          </div>
        </Cell>

        <Cell name="CountUp">
          <p className="o-display text-5xl">
            €<CountUp value={4700} />
          </p>
        </Cell>

        <Cell name="ScanPreview">
          <InView className="max-w-md">
            <ScanPreview
              pins={["No meta description", "Pricing hidden", "Unreadable to AI search"]}
              previewLabel="Preview"
              scoreLabel="readiness / 100"
            />
          </InView>
        </Cell>

        <Cell name="StepRail · vertical + horizontal">
          <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
            <div className="rounded-xl border bg-card p-4">
              <StepRail
                steps={[
                  { key: "a", label: "Scan and plan", state: "done", meta: "0:11" },
                  { key: "b", label: "Draft changes", state: "done", meta: "0:38" },
                  { key: "c", label: "Your review", state: "now", meta: "now" },
                  { key: "d", label: "Open pull request", state: "pending" },
                  { key: "e", label: "Verify live", state: "failed" },
                ]}
              />
            </div>
            <StepRail
              orientation="horizontal"
              steps={[
                { key: "a", label: "Scan and plan", state: "done" },
                { key: "b", label: "Your review", state: "now" },
                { key: "c", label: "Open pull request", state: "pending" },
              ]}
            />
          </div>
        </Cell>

        <Cell name="DiffView">
          <DiffView files={SAMPLE_DIFF} />
        </Cell>

        <Cell name="KpiTile · ConfidenceBar">
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiTile label="Search clicks / day" value={312} delta="+38% since first PR" positive />
            <KpiTile label="Readiness" value={94} unit="/100" delta="was 61" />
            <KpiTile label="AI citations" value={11} delta="was 3" positive />
            <KpiTile label="PRs merged" value={9} delta="of 10 opened" />
          </div>
          <div className="mt-4 flex flex-wrap gap-6">
            <ConfidenceBar level="high" label="High" />
            <ConfidenceBar level="medium" label="Medium" />
            <ConfidenceBar level="low" label="Low" />
          </div>
        </Cell>

        <Cell name="ImpactChart">
          <div className="rounded-xl border bg-card p-4">
            <ImpactChart
              points={series.points}
              markers={series.markers}
              ariaLabel="Example: daily clicks rising after three merged pull requests"
              formatX={(x) => `Day ${x}`}
            />
          </div>
        </Cell>

        <Cell name="MetricBars · MergeRing · FixFeed">
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border bg-card p-4">
              <MetricBars
                values={SAMPLE_MRR_WEEKS}
                max={5000}
                yLabels={["€5k", "€2.5k", "€0"]}
                xLabels={["W1", "W4", "W8", "W12"]}
                title="Example MRR over 12 weeks"
              />
            </div>
            <div className="grid gap-4">
              <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
                <MergeRing pct={87} />
                <div>
                  <p className="o-display text-2xl">87%</p>
                  <p className="text-xs text-muted-foreground">of opened PRs merged</p>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <FixFeed items={SAMPLE_FEED} mergedLabel="merged" />
              </div>
            </div>
          </div>
        </Cell>

        <Cell name="ConnectDiagram">
          <div className="max-w-md">
            <ConnectDiagram
              ariaLabel="GitHub and your site connected, Search Console pending"
              nodes={[
                { key: "gh", label: "GitHub", status: "connected", state: "connected" },
                { key: "site", label: "Your site", status: "scanned", state: "connected" },
                { key: "gsc", label: "Search Console", status: "optional", state: "pending" },
              ]}
              center={<Flower size={44} variant="breathe" />}
            />
          </div>
        </Cell>

        <Cell name="ConnectPanel · step 2 (GitHub not connected)">
          <ConnectPanel hasScan githubConfigured githubConnected={false} killSwitch={false} busy={null} onRegister={() => {}} onConnect={() => {}} />
        </Cell>

        <Cell name="ProductFrame">
          <ProductFrame url="olmene.com/app/agent/job/7f3a" badge={<ExampleBadge label="example" />}>
            <div className="p-5 text-sm text-muted-foreground">Any real UI renders inside.</div>
          </ProductFrame>
        </Cell>
      </div>
    </main>
  );
}
