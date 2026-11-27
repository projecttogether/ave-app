import { z } from 'zod'

// Bound raw input before normalization or parsing; accept exactly one mailbox.
export const emailSchema = z.string().max(320).pipe(
  z.string().trim().toLowerCase().max(255).email('Ungueltige E-Mail-Adresse'),
)

export const nameSchema = z.string().min(1, 'Name darf nicht leer sein').max(100).trim()

export const uuidSchema = z.string().uuid('Ungueltige ID')

export const yearSchema = z.number().int().min(2000).max(2100)

export const monthSchema = z.number().int().min(0).max(12)

export const roleSchema = z.enum(['basic_user', 'org_view_only', 'global_view_only', 'org_manager', 'admin', 'super_admin'])

export const rolesArraySchema = z.array(roleSchema)

export const organizationNameSchema = z.string().min(1, 'Name darf nicht leer sein').max(200).trim()

export const userStatusSchema = z.enum(['active', 'pending', 'invited', 'deactivated'])

export const paginationSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

// Dashboard links: only web/mail URLs, no javascript:/data: schemes
export const linkUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL darf nicht leer sein')
  .max(2000)
  .refine((url) => {
    try {
      const parsed = new URL(url, 'https://placeholder.invalid')
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
    } catch {
      return false
    }
  }, 'Nur http(s)- und mailto-Links sind erlaubt')

export const dashboardLinkSchema = z.object({
  id: z.string().max(100),
  name: z.string().trim().min(1, 'Name darf nicht leer sein').max(200),
  url: linkUrlSchema,
})

export const dashboardLinksSchema = z.array(dashboardLinkSchema).max(50)

// CSV file validation
export const csvFileSchema = z.object({
  size: z.number().max(5 * 1024 * 1024, 'Datei darf maximal 5 MB gross sein'),
  type: z.string().refine(
    (t) => ['text/csv', 'application/vnd.ms-excel', 'text/plain', ''].includes(t),
    'Nur CSV-Dateien sind erlaubt'
  ),
})
