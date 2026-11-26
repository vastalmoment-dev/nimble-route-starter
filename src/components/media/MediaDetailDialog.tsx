import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { MediaItem } from "@/lib/catalog/types";
import { ShowDetailBody } from "./ShowDetailBody";

export function MediaDetailDialog({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-y-auto border-foreground/10 bg-popover p-0 sm:rounded-2xl">
        {item && <ShowDetailBody key={item.key} item={item} mode="modal" onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
