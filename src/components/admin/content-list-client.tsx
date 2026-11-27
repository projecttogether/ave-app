"use client"

import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ContentPage = {
  slug: string
  title: string
  description: string
}

export function ContentListClient({ pages }: { pages: ContentPage[] }) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Seitentitel</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Beschreibung</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pages.map((page) => (
          <TableRow 
            key={page.slug} 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/admin/content/${page.slug}`)}
          >
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                {page.title}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{page.slug}</TableCell>
            <TableCell className="text-muted-foreground">{page.description}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
