import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';

import { AssetController } from './asset.controller';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [ConfigModule],
  controllers: [MetaController, AssetController],
  providers: [MetaService],
})
export class MetaModule {}
