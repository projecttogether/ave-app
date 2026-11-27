"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, ArrowDownCircle, ArrowRightCircle, ArrowRight, ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export type MissingTask = {
  id: string
  year: number
  title: string
  organization: string
  type: "operations" | "scoring"
  priority: "high" | "medium" | "low"
  status: "due" | "in_progress" | "choice"
  unavailableReason?: string
  href?: string
}

export const columns: ColumnDef<MissingTask>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Titel
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const type = row.original.type
      
      return (
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="hidden sm:inline-flex flex-shrink-0">
            {type === "operations" ? "Betriebsdaten" : "Scoring-Fragen"}
          </Badge>
          <span className="max-w-[400px] whitespace-normal font-medium">
            {row.original.href ? (
              <Link href={row.original.href} className="flex items-center gap-1 hover:underline">
                 <span className="whitespace-normal">{row.getValue("title")}</span>
                 <ArrowRight className="h-3 w-3 opacity-50 ml-1 flex-shrink-0" />
              </Link>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="whitespace-normal">{row.getValue("title")}</span>
                <span className="text-xs font-normal text-muted-foreground flex-shrink-0">{row.original.unavailableReason ?? "Nur Ansicht"}</span>
              </span>
            )}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status', header: 'Status',
    cell: ({ row }) => <Badge variant="outline">{row.original.status === 'in_progress' ? 'Jahr läuft' : row.original.status === 'choice' ? 'Auswahl erforderlich' : 'Fällig'}</Badge>,
  },
  {
    accessorKey: "year",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Jahr
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-center w-[60px]">{row.getValue("year")}</div>,
    filterFn: (row, id, value) => {
      const rowValue = row.getValue(id)
      return value.includes(String(rowValue))
    },
  },
  {
    accessorKey: "priority",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Priorität
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const priority = row.original.priority
      if (priority === "high") {
        return (
          <div className="flex items-center">
            <AlertCircle className="mr-2 h-4 w-4 text-red-500" />
            <span>Hoch</span>
          </div>
        )
      }
      if (priority === "medium") {
        return (
          <div className="flex items-center">
            <ArrowRightCircle className="mr-2 h-4 w-4 text-yellow-500" />
            <span>Mittel</span>
          </div>
        )
      }
      return (
        <div className="flex items-center">
          <ArrowDownCircle className="mr-2 h-4 w-4 text-blue-500" />
          <span>Niedrig</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      const rowValue = row.getValue(id)
      return value.includes(String(rowValue))
    },
  },
  {
    accessorKey: "organization",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Organisation
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="w-[120px] md:w-[150px] truncate">{row.getValue("organization")}</div>,
    filterFn: (row, id, value) => {
      const rowValue = row.getValue(id)
      return value.includes(String(rowValue))
    },
  },
]
