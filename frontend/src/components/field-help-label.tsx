"use client"

import { IconHelpCircle } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type FieldHelpLabelProps = {
  htmlFor?: string
  children: React.ReactNode
  help?: string
  requirement?: "required" | "optional"
}

export function FieldHelpLabel({
  htmlFor,
  children,
  help,
  requirement,
}: FieldHelpLabelProps) {
  const labelText =
    typeof children === "string"
      ? children
      : typeof children === "number"
        ? String(children)
        : "字段"

  return (
    <FieldLabel
      htmlFor={htmlFor}
      className="min-w-0 items-center gap-1.5 whitespace-nowrap"
    >
      <span className="shrink-0 whitespace-nowrap">{children}</span>
      {requirement && (
        <Badge
          variant={requirement === "required" ? "secondary" : "outline"}
          className="shrink-0"
        >
          {requirement === "required" ? "必填" : "可选"}
        </Badge>
      )}
      {help && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`${labelText}说明`}
              className="-ml-1 shrink-0"
            >
              <IconHelpCircle />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{help}</TooltipContent>
        </Tooltip>
      )}
    </FieldLabel>
  )
}
