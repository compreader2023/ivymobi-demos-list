import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ViewMode = "grid" | "list";

export default function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
      <Button
        type="button"
        variant={value === "grid" ? "default" : "ghost"}
        size="sm"
        className="rounded-none px-2"
        onClick={() => onChange("grid")}
        aria-label="宫格模式"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={value === "list" ? "default" : "ghost"}
        size="sm"
        className="rounded-none px-2"
        onClick={() => onChange("list")}
        aria-label="列表模式"
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
