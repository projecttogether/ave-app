import { describe, it, expect } from 'vitest'
import {
  emailSchema,
  nameSchema,
  uuidSchema,
  yearSchema,
  monthSchema,
  roleSchema,
  rolesArraySchema,
  organizationNameSchema,
  userStatusSchema,
  csvFileSchema,
  linkUrlSchema,
} from '@/lib/validation'

describe('Validation schemas', () => {
  describe('emailSchema', () => {
    it('accepts valid email', () => {
      expect(emailSchema.parse('user@example.com')).toBe('user@example.com')
    })
    it('rejects invalid email', () => {
      expect(() => emailSchema.parse('not-an-email')).toThrow()
    })
    it('rejects empty string', () => {
      expect(() => emailSchema.parse('')).toThrow()
    })
    it('trims whitespace', () => {
      expect(emailSchema.parse(' user@example.com ')).toBe('user@example.com')
    })
  })

  describe('nameSchema', () => {
    it('accepts valid name', () => {
      expect(nameSchema.parse('John Doe')).toBe('John Doe')
    })
    it('rejects empty string', () => {
      expect(() => nameSchema.parse('')).toThrow()
    })
    it('rejects name over 100 chars', () => {
      expect(() => nameSchema.parse('a'.repeat(101))).toThrow()
    })
  })

  describe('uuidSchema', () => {
    it('accepts valid UUID', () => {
      expect(uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBeTruthy()
    })
    it('rejects invalid UUID', () => {
      expect(() => uuidSchema.parse('not-a-uuid')).toThrow()
    })
  })

  describe('yearSchema', () => {
    it('accepts valid year', () => {
      expect(yearSchema.parse(2025)).toBe(2025)
    })
    it('rejects year below 2000', () => {
      expect(() => yearSchema.parse(1999)).toThrow()
    })
    it('rejects year above 2100', () => {
      expect(() => yearSchema.parse(2101)).toThrow()
    })
    it('rejects non-integer', () => {
      expect(() => yearSchema.parse(2025.5)).toThrow()
    })
  })

  describe('monthSchema', () => {
    it('accepts 0 (yearly)', () => {
      expect(monthSchema.parse(0)).toBe(0)
    })
    it('accepts 12', () => {
      expect(monthSchema.parse(12)).toBe(12)
    })
    it('rejects 13', () => {
      expect(() => monthSchema.parse(13)).toThrow()
    })
    it('rejects -1', () => {
      expect(() => monthSchema.parse(-1)).toThrow()
    })
  })

  describe('roleSchema', () => {
    it('accepts valid roles', () => {
      expect(roleSchema.parse('admin')).toBe('admin')
      expect(roleSchema.parse('super_admin')).toBe('super_admin')
      expect(roleSchema.parse('basic_user')).toBe('basic_user')
      expect(roleSchema.parse('global_view_only')).toBe('global_view_only')
    })
    it('rejects invalid role', () => {
      expect(() => roleSchema.parse('invalid_role')).toThrow()
    })
  })

  describe('rolesArraySchema', () => {
    it('accepts array of valid roles', () => {
      expect(rolesArraySchema.parse(['admin', 'org_manager'])).toEqual(['admin', 'org_manager'])
    })
    it('rejects array with invalid role', () => {
      expect(() => rolesArraySchema.parse(['admin', 'hacker'])).toThrow()
    })
    it('accepts empty array', () => {
      expect(rolesArraySchema.parse([])).toEqual([])
    })
  })

  describe('organizationNameSchema', () => {
    it('accepts valid name', () => {
      expect(organizationNameSchema.parse('My Org')).toBe('My Org')
    })
    it('rejects empty', () => {
      expect(() => organizationNameSchema.parse('')).toThrow()
    })
    it('rejects over 200 chars', () => {
      expect(() => organizationNameSchema.parse('x'.repeat(201))).toThrow()
    })
  })

  describe('userStatusSchema', () => {
    it('accepts valid statuses', () => {
      expect(userStatusSchema.parse('active')).toBe('active')
      expect(userStatusSchema.parse('deactivated')).toBe('deactivated')
    })
    it('rejects invalid status', () => {
      expect(() => userStatusSchema.parse('banned')).toThrow()
    })
  })

  describe('linkUrlSchema', () => {
    it('accepts http(s) and mailto URLs', () => {
      expect(linkUrlSchema.parse('https://example.org/page')).toBeTruthy()
      expect(linkUrlSchema.parse('http://example.org')).toBeTruthy()
      expect(linkUrlSchema.parse('mailto:info@example.org')).toBeTruthy()
    })
    it('accepts relative internal paths', () => {
      expect(linkUrlSchema.parse('/datasets')).toBeTruthy()
    })
    it('rejects javascript: and data: URLs', () => {
      expect(() => linkUrlSchema.parse('javascript:alert(1)')).toThrow()
      expect(() => linkUrlSchema.parse('data:text/html,<script>alert(1)</script>')).toThrow()
      expect(() => linkUrlSchema.parse(' JavaScript:alert(1)')).toThrow()
    })
  })

  describe('csvFileSchema', () => {
    it('accepts valid CSV file', () => {
      expect(csvFileSchema.parse({ size: 1024, type: 'text/csv' })).toBeTruthy()
    })
    it('rejects file over 5MB', () => {
      expect(() => csvFileSchema.parse({ size: 6 * 1024 * 1024, type: 'text/csv' })).toThrow()
    })
    it('rejects invalid MIME type', () => {
      expect(() => csvFileSchema.parse({ size: 1024, type: 'application/pdf' })).toThrow()
    })
    it('accepts empty type (browser may not set it)', () => {
      expect(csvFileSchema.parse({ size: 1024, type: '' })).toBeTruthy()
    })
  })
})
