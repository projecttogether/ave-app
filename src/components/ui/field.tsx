import * as React from "react"

import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/*  FieldSet                                                                  */
/* -------------------------------------------------------------------------- */

function FieldSet({
  className,
  ...props
}: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("space-y-6 border-none p-0 m-0", className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldLegend                                                               */
/* -------------------------------------------------------------------------- */

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & {
  variant?: "legend" | "label"
}) {
  return (
    <legend
      data-slot="field-legend"
      className={cn(
        variant === "legend"
          ? "text-base font-semibold leading-7"
          : "text-sm font-medium leading-none",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldGroup                                                                */
/* -------------------------------------------------------------------------- */

function FieldGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal" | "responsive"
}) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field grid gap-2",
        orientation === "horizontal" &&
          "grid-cols-[auto_1fr] items-center gap-x-3",
        orientation === "responsive" &&
          "grid-cols-1 @md/field-group:grid-cols-[auto_1fr] @md/field-group:items-center @md/field-group:gap-x-3",
        "data-[invalid]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldContent                                                              */
/* -------------------------------------------------------------------------- */

function FieldContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldLabel                                                                */
/* -------------------------------------------------------------------------- */

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium leading-none select-none",
        "group-data-[disabled=true]/field:pointer-events-none group-data-[disabled=true]/field:opacity-50",
        "group-data-[invalid]/field:text-destructive",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldTitle                                                                */
/* -------------------------------------------------------------------------- */

function FieldTitle({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-title"
      className={cn(
        "text-sm font-medium leading-none",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldDescription                                                          */
/* -------------------------------------------------------------------------- */

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-[0.8rem] leading-snug text-pretty",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldError                                                                */
/* -------------------------------------------------------------------------- */

function FieldError({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn(
        "text-destructive text-[0.8rem] leading-snug font-medium",
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  FieldSeparator                                                            */
/* -------------------------------------------------------------------------- */

function FieldSeparator({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  if (children) {
    return (
      <div
        data-slot="field-separator"
        className={cn(
          "flex items-center gap-3 text-muted-foreground text-xs",
          className
        )}
        {...props}
      >
        <div className="bg-border h-px flex-1" />
        <span>{children}</span>
        <div className="bg-border h-px flex-1" />
      </div>
    )
  }

  return (
    <div
      data-slot="field-separator"
      className={cn("bg-border h-px", className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Exports                                                                   */
/* -------------------------------------------------------------------------- */

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
}
