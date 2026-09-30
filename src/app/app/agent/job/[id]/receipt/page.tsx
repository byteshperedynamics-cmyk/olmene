"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoLoader } from "@/components/logo-loader";
import { featureAgentEnabled, getAgentReceipt } from "@/lib/agent-client";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [content, setContent] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    getAgentReceipt(id)
      .then((r) => alive && setContent(r.content))
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!featureAgentEnabled()) {
    return <p className="py-16 text-center text-sm text-muted-foreground">The fix agent is not enabled.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/agent/job/${id}`}>
            <ArrowLeft className="mr-1 size-4" aria-hidden /> Back to job
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(content ?? "").then(() => toast.success("Receipt copied as Markdown."));
            }}
            disabled={!content}
          >
            <Copy className="mr-1 size-3.5" aria-hidden /> Copy Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 size-3.5" aria-hidden /> Print / PDF
          </Button>
        </div>
      </div>

      {notFound ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No receipt yet — it is generated after the verify step finishes.
          </CardContent>
        </Card>
      ) : !content ? (
        <div className="grid place-items-center py-24">
          <LogoLoader size={44} glow />
        </div>
      ) : (
        <Card>
          <CardHeader className="print:hidden">
            <CardTitle className="text-base">Receipt</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{content}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
