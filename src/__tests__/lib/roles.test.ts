import { describe, it, expect } from 'vitest'
import { isAdmin, isSuperAdmin, isOrgManager, isOrgViewOnly, isGlobalViewOnly, isViewOnly, canViewAllOrgData, canEnterReflection, isBasicUser } from '@/lib/roles'

describe('Role helper functions', () => {
  describe('isAdmin', () => {
    it('returns true for admin role', () => {
      expect(isAdmin(['admin'])).toBe(true)
    })
    it('returns true for super_admin role', () => {
      expect(isAdmin(['super_admin'])).toBe(true)
    })
    it('returns false for basic_user', () => {
      expect(isAdmin(['basic_user'])).toBe(false)
    })
    it('returns false for empty array', () => {
      expect(isAdmin([])).toBe(false)
    })
    it('returns true when admin is one of multiple roles', () => {
      expect(isAdmin(['basic_user', 'admin'])).toBe(true)
    })
  })

  describe('isSuperAdmin', () => {
    it('returns true for super_admin', () => {
      expect(isSuperAdmin(['super_admin'])).toBe(true)
    })
    it('returns false for admin', () => {
      expect(isSuperAdmin(['admin'])).toBe(false)
    })
    it('returns false for empty array', () => {
      expect(isSuperAdmin([])).toBe(false)
    })
  })

  describe('isOrgManager', () => {
    it('returns true for org_manager', () => {
      expect(isOrgManager(['org_manager'])).toBe(true)
    })
    it('returns false for basic_user', () => {
      expect(isOrgManager(['basic_user'])).toBe(false)
    })
  })

  describe('isOrgViewOnly', () => {
    it('returns true for org_view_only', () => {
      expect(isOrgViewOnly(['org_view_only'])).toBe(true)
    })
    it('returns false for org_manager', () => {
      expect(isOrgViewOnly(['org_manager'])).toBe(false)
    })
  })

  describe('isGlobalViewOnly', () => {
    it('returns true for global_view_only', () => {
      expect(isGlobalViewOnly(['global_view_only'])).toBe(true)
    })
    it('does not count as admin', () => {
      expect(isAdmin(['global_view_only'])).toBe(false)
    })
  })

  describe('isViewOnly', () => {
    it('returns true for org and global view-only roles', () => {
      expect(isViewOnly(['org_view_only'])).toBe(true)
      expect(isViewOnly(['global_view_only'])).toBe(true)
    })
  })

  describe('canViewAllOrgData', () => {
    it('returns true for admins and global view-only users', () => {
      expect(canViewAllOrgData(['admin'])).toBe(true)
      expect(canViewAllOrgData(['global_view_only'])).toBe(true)
    })
    it('returns false for org-scoped view-only users', () => {
      expect(canViewAllOrgData(['org_view_only'])).toBe(false)
    })
  })

  describe('canEnterReflection', () => {
    it('returns true for org managers and admins', () => {
      expect(canEnterReflection(['org_manager'])).toBe(true)
      expect(canEnterReflection(['admin'])).toBe(true)
    })
    it('returns false for basic and view-only users', () => {
      expect(canEnterReflection(['basic_user'])).toBe(false)
      expect(canEnterReflection(['org_view_only'])).toBe(false)
      expect(canEnterReflection(['global_view_only'])).toBe(false)
    })
  })

  describe('isBasicUser', () => {
    it('returns true for basic_user', () => {
      expect(isBasicUser(['basic_user'])).toBe(true)
    })
    it('returns false for admin', () => {
      expect(isBasicUser(['admin'])).toBe(false)
    })
  })
})
