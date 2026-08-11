"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** One multi-select facet. Selections within a facet are an OR (assumption in scope.md). */
export function LicenseFacetFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <Popover>
      {/*
        Base UI composes through `render`, not Radix's `asChild`. The trigger
        renders our Button and merges its own props onto it.
      */}
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="gap-2" />}
      >
        {label}
        {selected.length > 0 && (
          <Badge variant="secondary" className="rounded-sm px-1 font-normal">
            {selected.length}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex flex-col gap-1">
          {options.map((option) => {
            const id = `${label}-${option}`;
            return (
              <Label
                key={option}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-normal hover:bg-accent"
              >
                <Checkbox
                  id={id}
                  checked={selected.includes(option)}
                  onCheckedChange={() => onToggle(option)}
                />
                {option}
              </Label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
