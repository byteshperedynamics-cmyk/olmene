"use client";

import { use, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoLoader } from "@/components/logo-loader";
import { AgentApiError, featureAgentEnabled, getAgentReceipt } from "@/lib/agent-client";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [content, setContent] = useState<string | null>(null);
  // "job": no such fix run for this account; "receipt": the run exists but hasn't verified yet.
  const [notFound, setNotFound] = useState<"job" | "receipt" | null>(null);

  useEffect(() => {
    let alive = true;
    getAgentReceipt(id)
      .then((r) => alive && setContent(r.content))
      .catch((e) => alive && setNotFound(e instanceof AgentApiError && e.message.startsWith("job") ? "job" : "receipt"));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!featureAgentEnabled()) {
    return <p className="py-16 text-center text-sm text-muted-foreground">The fix agent is not enabled.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/agent/job/${id}`}>
            <ArrowLeft className="mr-1 size-4" aria-hidden /> Back to job
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
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
            {notFound === "job"
              ? "This fix run doesn't exist, or it belongs to another account."
              : "No receipt yet — it is generated after the verify step finishes."}
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
            <div className="receipt-md break-words text-sm leading-relaxed">
              {/* Markdown is rendered, never raw HTML (react-markdown ignores HTML by default). */}
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="mb-3 font-display text-xl font-semibold">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-2 mt-6 text-base font-semibold">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-1 mt-4 font-mono text-[13px] font-semibold">{children}</h3>,
                  p: ({ children }) => <p className="my-2">{children}</p>,
                  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>,
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                      {children}
                    </a>
                  ),
                  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">{children}</code>,
                  em: ({ children }) => <em className="text-muted-foreground">{children}</em>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
