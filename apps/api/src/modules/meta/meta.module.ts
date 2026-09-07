import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';

import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [ConfigModule],
  controllers: [MetaController],
  providers: [MetaService],
})
export class MetaModule {}
