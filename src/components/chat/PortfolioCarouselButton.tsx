import { useState } from "react";
import { usePortfolioSites, type PortfolioSite } from "@/hooks/use-portfolio-sites";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Images, ExternalLink, Send, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSendSite: (message: string, url: string) => void;
  disabled?: boolean;
  triggerVariant?: "icon" | "button";
}

const CATEGORY_LABEL: Record<string, string> = {
  landing: "Landing",
  ecommerce: "E-commerce",
  saas: "SaaS",
  portfolio: "Portfólio",
};

export function PortfolioCarouselButton({ onSendSite, disabled, triggerVariant = "icon" }: Props) {
  const { sites, isLoading, trackSend } = usePortfolioSites();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PortfolioSite | null>(null);
  const [customMessage, setCustomMessage] = useState("");

  const handlePickSite = (site: PortfolioSite) => {
    setSelected(site);
    setCustomMessage(
      `Olha esse site que fizemos, vê se te inspira 👇\n\n${site.title}\n${site.url}`
    );
  };

  const handleConfirmSend = async () => {
    if (!selected) return;
    await trackSend(selected.id);
    onSendSite(customMessage, selected.url);
    setOpen(false);
    setSelected(null);
    setCustomMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            {triggerVariant === "icon" ? (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 mb-0.5" disabled={disabled} aria-label="Enviar site de portfólio">
                <Images className="h-4 w-4 text-chart-4" />
              </Button>
            ) : (
              <Button variant="outline" disabled={disabled}>
                <Images className="h-4 w-4 mr-2" /> Portfólio
              </Button>
            )}
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Enviar site de portfólio</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-5 w-5 text-primary" />
            Portfólio de Sites
            <Badge variant="secondary" className="ml-2">{sites.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            {/* Carousel */}
            <ScrollArea className="w-full pb-3">
              <div className="flex gap-4 pb-4">
                {sites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    active={selected?.id === site.id}
                    onSelect={() => handlePickSite(site)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Selected preview + message */}
            {selected && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{selected.title}</p>
                    <a href={selected.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      {selected.url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {selected.send_count > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <TrendingUp className="h-3 w-3" /> Enviado {selected.send_count}x
                    </Badge>
                  )}
                </div>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Mensagem que acompanha o link..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                  <Button onClick={handleConfirmSend} disabled={!customMessage.trim()}>
                    <Send className="h-4 w-4 mr-2" /> Enviar no WhatsApp
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SiteCard({ site, active, onSelect }: { site: PortfolioSite; active: boolean; onSelect: () => void }) {
  return (
    <Card
      className={cn(
        "shrink-0 w-[280px] overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
        active && "ring-2 ring-primary shadow-lg"
      )}
      onClick={onSelect}
    >
      {/* iframe live preview */}
      <div className="relative w-full h-[180px] bg-muted overflow-hidden pointer-events-none">
        <iframe
          src={site.url}
          title={site.title}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: "1280px", height: "800px", transform: "scale(0.22)" }}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
        />
        {active && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-primary rounded-t-lg pointer-events-none" />
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold line-clamp-1">{site.title}</p>
          {site.category && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {CATEGORY_LABEL[site.category] || site.category}
            </Badge>
          )}
        </div>
        {site.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{site.description}</p>
        )}
      </div>
    </Card>
  );
}
