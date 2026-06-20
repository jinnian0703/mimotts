"use client"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const defaultPageSizeOptions = [20, 50, 100]

type TablePaginationProps = {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = defaultPageSizeOptions,
}: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = total === 0 ? 0 : Math.min(total, safePage * pageSize)
  const pages = visiblePages(safePage, pageCount)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          显示 {start} 至 {end} 共 {total} 条结果
        </span>
        <div className="flex items-center gap-2">
          <span>每页:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-9 w-20 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectGroup>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="上一页"
        >
          <IconChevronLeft />
        </Button>
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex h-9 min-w-9 items-center justify-center px-2"
            >
              ...
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === safePage ? "default" : "outline"}
              className="h-9 min-w-9 px-3"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="下一页"
        >
          <IconChevronRight />
        </Button>
      </div>
    </div>
  )
}

function visiblePages(page: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const pages: Array<number | "ellipsis"> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)

  if (start > 2) {
    pages.push("ellipsis")
  }

  for (let value = start; value <= end; value += 1) {
    pages.push(value)
  }

  if (end < pageCount - 1) {
    pages.push("ellipsis")
  }

  pages.push(pageCount)

  return pages
}
