import { Badge } from "@/components/ui/badge"
import type { TaskStatus } from "@/lib/types"

const statusText: Record<TaskStatus, string> = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant={status === "failed" ? "destructive" : "secondary"}>
      {statusText[status]}
    </Badge>
  )
}
