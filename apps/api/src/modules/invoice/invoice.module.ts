import { Module } from '@nestjs/common';

import { InvoicePublic } from './invoice.public';
import { InvoiceService } from './invoice.service';

@Module({
  providers: [InvoiceService, InvoicePublic],
  exports: [InvoicePublic],
})
export class InvoiceModule {}
