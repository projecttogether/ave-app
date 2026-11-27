"use client"

import * as React from "react"
import { NumericFormat, NumericFormatProps } from "react-number-format"
import { Input } from "@/components/ui/input"

export const CurrencyInput = React.forwardRef<HTMLInputElement, NumericFormatProps>(
  (props, ref) => {
    return (
      <NumericFormat
        customInput={Input}
        getInputRef={ref}
        decimalSeparator=","
        thousandSeparator="."
        suffix=" €"
        decimalScale={6}
        valueIsNumericString
        allowNegative={false}
        {...props}
      />
    )
  }
)
CurrencyInput.displayName = "CurrencyInput"
