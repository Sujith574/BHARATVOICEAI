import { PrismaClient, RecordStatus } from "@prisma/client";

const prisma = new PrismaClient();

const permissions = [
  {
    code: "mobile.dashboard.read",
    name: "Read Mobile Dashboard",
    description: "Access the admin mobile dashboard and summary session context."
  },
  {
    code: "platform.users.read",
    name: "Read Users",
    description: "View Bharat Voice platform users."
  },
  {
    code: "platform.users.manage",
    name: "Manage Users",
    description: "Invite, activate, suspend, and manage platform users."
  },
  {
    code: "platform.roles.read",
    name: "Read Roles",
    description: "View RBAC roles and assignments."
  },
  {
    code: "platform.roles.manage",
    name: "Manage Roles",
    description: "Manage RBAC roles and permission assignments."
  },
  {
    code: "voice.calls.read",
    name: "Read Calls",
    description: "Access call records and call analytics."
  },
  {
    code: "voice.calls.monitor",
    name: "Monitor Live Calls",
    description: "Monitor active and live call sessions."
  },
  {
    code: "knowledge.documents.read",
    name: "Read Knowledge Documents",
    description: "View knowledge documents and version metadata."
  },
  {
    code: "knowledge.documents.manage",
    name: "Manage Knowledge Documents",
    description: "Upload, update, or archive knowledge documents."
  },
  {
    code: "knowledge.documents.approve",
    name: "Approve Knowledge Documents",
    description: "Approve or reject knowledge content for production use."
  },
  {
    code: "knowledge.departments.manage",
    name: "Manage Departments",
    description: "Create or manage departments and related catalog metadata."
  },
  {
    code: "knowledge.services.manage",
    name: "Manage Services",
    description: "Create or manage service catalog metadata."
  },
  {
    code: "analytics.read",
    name: "Read Analytics",
    description: "Access platform analytics, trends, and reporting."
  },
  {
    code: "tickets.read",
    name: "Read Tickets",
    description: "View human escalation tickets and ticket history."
  },
  {
    code: "tickets.manage",
    name: "Manage Tickets",
    description: "Create, assign, and resolve human escalation tickets."
  },
  {
    code: "audit.read",
    name: "Read Audit Logs",
    description: "Access platform audit history."
  },
  {
    code: "platform.settings.manage",
    name: "Manage Settings",
    description: "Update platform-wide runtime settings."
  },
  {
    code: "notifications.read",
    name: "Read Notifications",
    description: "Access administrative notification feeds."
  }
] as const;

const roles = [
  {
    code: "SUPER_ADMIN",
    name: "Super Admin",
    description: "Full administrative control over the Bharat Voice platform.",
    permissionCodes: permissions.map((permission) => permission.code)
  },
  {
    code: "OPS_ADMIN",
    name: "Operations Admin",
    description: "Operational access to calls, tickets, analytics, and notifications.",
    permissionCodes: [
      "mobile.dashboard.read",
      "voice.calls.read",
      "voice.calls.monitor",
      "tickets.read",
      "tickets.manage",
      "analytics.read",
      "notifications.read"
    ]
  },
  {
    code: "KNOWLEDGE_MANAGER",
    name: "Knowledge Manager",
    description: "Knowledge and department catalog management access.",
    permissionCodes: [
      "mobile.dashboard.read",
      "knowledge.documents.read",
      "knowledge.documents.manage",
      "knowledge.documents.approve",
      "knowledge.departments.manage",
      "knowledge.services.manage",
      "notifications.read"
    ]
  },
  {
    code: "ADMIN_VIEWER",
    name: "Admin Viewer",
    description: "Read-only administrative access for the mobile app.",
    permissionCodes: [
      "mobile.dashboard.read",
      "voice.calls.read",
      "knowledge.documents.read",
      "analytics.read",
      "tickets.read",
      "notifications.read"
    ]
  }
] as const;

const main = async (): Promise<void> => {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        ...permission,
        status: RecordStatus.ACTIVE
      },
      update: {
        name: permission.name,
        description: permission.description,
        status: RecordStatus.ACTIVE
      }
    });
  }

  for (const role of roles) {
    const roleRecord = await prisma.role.upsert({
      where: { code: role.code },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystemRole: true,
        status: RecordStatus.ACTIVE
      },
      update: {
        name: role.name,
        description: role.description,
        isSystemRole: true,
        status: RecordStatus.ACTIVE
      }
    });

    for (const permissionCode of role.permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: permissionCode }
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleRecord.id,
            permissionId: permission.id
          }
        },
        create: {
          roleId: roleRecord.id,
          permissionId: permission.id
        },
        update: {}
      });
    }
  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("Prisma seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
