"use client"

import * as React from "react"
import { NumericFormat, NumericFormatProps } from "react-number-format"
import { Input } from "@/components/ui/input"

export const NumberInput = React.forwardRef<HTMLInputElement, NumericFormatProps>(
  (props, ref) => {
    return (
      <NumericFormat
        customInput={Input}
        getInputRef={ref}
        decimalSeparator=","
        allowNegative={false}
        valueIsNumericString
        decimalScale={6}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"
