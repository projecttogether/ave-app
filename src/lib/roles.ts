/**
 * Role helper utilities.
 * These are plain functions (not server actions) so they can be
 * imported from both server-action files and regular components.
 */


/** Returns true if the user has admin-level access (admin or super_admin). */
export function isAdmin(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('admin') || roles.includes('super_admin')
}

/** Returns true if the user has super_admin role. */
export function isSuperAdmin(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('super_admin')
}

/** Returns true if the user has org_manager role. */
export function isOrgManager(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('org_manager');
}

/** Returns true if the user has org_view_only role. */
export function isOrgViewOnly(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('org_view_only');
}

/** Returns true if the user has global_view_only role. */
export function isGlobalViewOnly(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('global_view_only');
}

/** Returns true if the user has any read-only role. */
export function isViewOnly(roles: string[] | undefined | null): boolean {
    return isOrgViewOnly(roles) || isGlobalViewOnly(roles);
}

/** Returns true if the user can read data across all organizations. */
export function canViewAllOrgData(roles: string[] | undefined | null): boolean {
    return isAdmin(roles) || isGlobalViewOnly(roles);
}

/** Returns true if the user may enter the organization's reflection answers. */
export function canEnterReflection(roles: string[] | undefined | null): boolean {
    return isOrgManager(roles) || isAdmin(roles);
}

/** Returns true if the user has basic_user role. */
export function isBasicUser(roles: string[] | undefined | null): boolean {
    if (!roles) return false;
    return roles.includes('basic_user');
}

/** Read scope for basic users who do not also have broader read permissions. */
export function isSubOrganizationScoped(roles: string[] | undefined | null): boolean {
    return isBasicUser(roles) && !canViewAllOrgData(roles) && !isOrgManager(roles) && !isOrgViewOnly(roles)
}
