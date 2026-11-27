export type AppRole = 'basic_user' | 'org_manager' | 'org_view_only' | 'global_view_only' | 'admin' | 'super_admin';

export type UserStatus = 'active' | 'pending' | 'invited' | 'deactivated';

export interface Profile {
    id: string;
    name: string | null;
    email: string | null;
    roles: AppRole[];
    createdAt: Date | null;
    organizationId: string | null;
    status: UserStatus;
    lastLogin: Date | null;
}

export interface Organization {
    id: string;
    name: string;
    createdAt: Date | null;
}

export interface SubOrganization {
    id: string;
    organizationId: string;
    name: string;
    createdAt: Date | null;
}

export interface SubOrganizationMember {
    id: string;
    subOrganizationId: string;
    userId: string;
    role: 'organization_manager' | 'organization_user';
    createdAt: Date | null;
}

export interface OrganizationWithSubs extends Organization {
    subOrganizations: SubOrganization[];
}
