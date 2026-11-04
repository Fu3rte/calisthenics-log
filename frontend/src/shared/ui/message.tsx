import * as React from "react";
import { cn } from "@/shared/lib/utils";

/* 基底取 shadcn 注册表的 @shadcn/message，只留气泡用到的两个导出：
   未接上的组件照样会被 Tailwind 打进 CSS 产物，所以不带入 MessageAvatar/Header/Footer。 */

function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse",
        className
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5 wrap-break-word group-data-[align=end]/message:*:data-slot:self-end",
        className
      )}
      {...props}
    />
  );
}

export { Message, MessageContent };
