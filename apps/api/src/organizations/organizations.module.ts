import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationDocumentsService } from './organization-documents.service';
import { OrganizationsService } from './organizations.service';

@Module({ controllers: [OrganizationsController], providers: [OrganizationsService, OrganizationDocumentsService] })
export class OrganizationsModule {}
