import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ContractListQueryDto, CreateContractDto, UpdateContractDto } from './contracts.dto';
import { ContractsService } from './contracts.service';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list(@Query() query: ContractListQueryDto) { return this.contracts.list(query); }

  @Post()
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  create(@Body() dto: CreateContractDto, @CurrentUser() user: AuthUser) {
    return this.contracts.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: AuthUser) {
    return this.contracts.update(id, dto, user.id);
  }

  @Post(':id/sign')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  sign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.contracts.setStatus(id, 'SIGNED', user.id);
  }

  @Post(':id/void')
  @Roles('SYSTEM_ADMIN', 'ADMIN')
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.contracts.setStatus(id, 'VOID', user.id);
  }
}
