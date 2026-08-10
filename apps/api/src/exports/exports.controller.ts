import { Controller, Get, Param, ParseEnumPipe, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ExportDataset, ExportQueryDto } from './exports.dto';
import { ExportsService } from './exports.service';

@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get(':dataset')
  async export(
    @Param('dataset', new ParseEnumPipe(ExportDataset)) dataset: ExportDataset,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.exportsService.export(dataset, query, user);
    return new StreamableFile(result.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      length: result.buffer.length,
    });
  }
}
