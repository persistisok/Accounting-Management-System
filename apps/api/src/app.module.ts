import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { LedgerAttachmentsModule } from './attachments/ledger-attachments.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BankingModule } from './banking/banking.module';
import { ContractsModule } from './contracts/contracts.module';
import { ExpertsModule } from './experts/experts.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MembershipsModule } from './memberships/memberships.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectManagersModule } from './project-managers/project-managers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AccountsModule,
    LedgerAttachmentsModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    ProjectManagersModule,
    OrganizationsModule,
    ContractsModule,
    BankingModule,
    InvoicesModule,
    ExpertsModule,
    MembershipsModule,
  ],
})
export class AppModule {}
