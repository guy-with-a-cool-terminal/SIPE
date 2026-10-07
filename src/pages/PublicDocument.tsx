import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentPaper, PaperFrame } from "@/components/invoicing/DocumentPaper";
import {
  KIND_LABEL, displayStatus, issuerDisplayName,
  type DocumentItem, type DocumentPayment, type SalesDocument,
} from "@/lib/invoicing";

/**
 * What a client sees from a share link. No auth: the token is the capability,
 * and get_public_document() never returns drafts.
 */
const PublicDocument = () => {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["public-document", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_document", { p_token: token });
      if (error) throw error;
      return data as { document: SalesDocument; items: DocumentItem[]; payments: DocumentPayment[] } | null;
    },
  });

  const doc = data?.document;
  const title = doc ? `${doc.number} · ${issuerDisplayName(doc.issuer_snapshot)}` : "Document";

  useEffect(() => {
    document.title = title;
  }, [title]);

  const print = () => {
    const previous = document.title;
    document.title = (doc?.number ?? "document").replace(/[^\w-]+/g, "-");
    window.print();
    document.title = previous;
  };

  return (
    // A light page on purpose: this is the client's view of a paper document, not the SIPE app.
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      {isLoading ? (
        <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>
      ) : !doc ? (
        <div className="grid min-h-screen place-items-center px-6 text-center">
          <div>
            <p className="text-lg font-semibold">This link isn't valid</p>
            <p className="mt-1 text-sm text-slate-500">Ask the sender for a new one.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
            <div className="mx-auto flex max-w-[826px] items-center justify-between gap-3 px-4 py-3">
              <p className="min-w-0 truncate text-sm">
                <span className="font-semibold">{KIND_LABEL[doc.kind].title} {doc.number}</span>
                <span className="text-slate-500"> from {issuerDisplayName(doc.issuer_snapshot)}</span>
              </p>
              <button
                onClick={print}
                className="flex flex-shrink-0 items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <Printer className="size-4" /> Download PDF
              </button>
            </div>
          </div>
          <main className="mx-auto max-w-[826px] px-4 py-6 sm:py-10 print:p-0">
            <PaperFrame>
              <DocumentPaper
                kind={doc.kind}
                status={(() => { const s = displayStatus(doc); return s === "partial" || s === "overdue" || s === "expired" ? "sent" : s; })()}
                number={doc.number}
                doc={doc}
                items={data.items}
                totals={{ subtotal: Number(doc.subtotal), discount: Number(doc.discount_amount), tax: Number(doc.tax_amount), total: Number(doc.total) }}
                amountPaid={Number(doc.amount_paid)}
                issuer={doc.issuer_snapshot}
                client={doc.client_snapshot}
                payments={data.payments}
              />
            </PaperFrame>
            <p className="mt-6 text-center text-xs text-slate-500 print:hidden">
              Sent with <a href="/" className="underline">SIPE</a>
            </p>
          </main>
        </>
      )}
    </div>
  );
};

export default PublicDocument;
