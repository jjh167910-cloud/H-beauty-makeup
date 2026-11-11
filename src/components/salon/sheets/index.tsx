import { useState } from "react";
import { familyById } from "@/data/catalog";
import { styleById } from "@/data/makeup-styles";
import { serviceById } from "@/data/salon";
import { Sheet, type SheetState } from "../ui";
import { BookingSheet } from "./booking";
import { Discover } from "./discover";
import { CompareBody, ConsultBody, FinderBody } from "./tools";
import { LookSheet } from "./look";
import { MakeupSheet } from "./makeup";
import { ServiceSheet } from "./service";

const TITLES = { compare: "مقایسه مدل‌ها", consult: "درخواست مشاوره", finder: "استایل‌یاب" } as const;

/** Keeps the last sheet mounted while it animates closed; remounts fresh on each new open. */
export function Sheets({ sheet, onClose }: { sheet: SheetState; onClose: () => void }) {
  const [memo, setMemo] = useState({ last: sheet, version: 0, open: false });
  if (sheet && sheet !== memo.last) setMemo({ last: sheet, version: memo.open ? memo.version : memo.version + 1, open: true });
  else if (!sheet && memo.open) setMemo({ ...memo, open: false });

  const current = sheet ?? memo.last;
  const open = sheet !== null;
  if (!current) return null;
  const key = `${current.kind}-${"id" in current ? current.id : ""}-${memo.version}`;

  if (current.kind === "discover") return <Discover key={key} open={open} startId={current.id} onClose={onClose} />;
  if (current.kind === "booking") return <BookingSheet key={key} open={open} onClose={onClose} />;
  if (current.kind === "look") {
    const family = familyById.get(current.id);
    return family ? <LookSheet key={key} open={open} family={family} onClose={onClose} /> : null;
  }
  if (current.kind === "makeup") {
    const style = styleById.get(current.id);
    return style ? <MakeupSheet key={key} open={open} style={style} onClose={onClose} /> : null;
  }
  if (current.kind === "service") {
    const service = serviceById.get(current.id);
    return service ? <ServiceSheet key={key} open={open} service={service} onClose={onClose} /> : null;
  }
  return (
    <Sheet key={key} open={open} onClose={onClose} title={TITLES[current.kind]}>
      {current.kind === "compare" ? <CompareBody /> : null}
      {current.kind === "consult" ? <ConsultBody /> : null}
      {current.kind === "finder" ? <FinderBody /> : null}
    </Sheet>
  );
}
