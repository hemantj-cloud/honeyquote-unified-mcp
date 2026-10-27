import { Module } from '@nitrostack/core';

import { InsuranceService } from './insurance.service.js';
import { DemoTools } from './insurance.tools.js';
import { McpApiAuthService } from './mcp-api-auth.service.js';
import { InsurancePrompts } from './insurance.prompts.js';

@Module({
    name: 'demo',
    controllers: [DemoTools],
    providers: [McpApiAuthService, InsuranceService, InsurancePrompts],
})

export class InsuranceModule { }