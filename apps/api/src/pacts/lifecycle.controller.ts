import { Inject, Controller,Get,Post,Body,Param,Req,Headers,UseGuards } from '@nestjs/common';
import { AuthenticationGuard,type AuthRequest } from '../auth/auth.module';
import { LifecycleService } from './lifecycle.service';
@Controller('v1') @UseGuards(AuthenticationGuard)
export class LifecycleController{
 constructor(@Inject(LifecycleService) private readonly service:LifecycleService){}
 @Get('pacts') async list(@Req() r:AuthRequest){return {data:await this.service.list(r.identity)};}
 @Post('pacts') async create(@Req() r:AuthRequest,@Body() body:unknown,@Headers('idempotency-key') key:string){return {data:await this.service.create(r.identity,body,key)};}
 @Get('pacts/:id') async detail(@Req() r:AuthRequest,@Param('id') id:string){return {data:await this.service.detail(id,r.identity)};}
 @Post('invitations/:id/accept') async accept(@Req() r:AuthRequest,@Param('id') id:string){return {data:await this.service.accept(id,r.identity)};}
 @Post('pacts/:id/commitments') async commitment(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){return {data:await this.service.addCommitment(id,r.identity,body)};}
 @Post('pacts/:id/milestones/:mid/deliver') async milestone(@Req() r:AuthRequest,@Param('id') id:string,@Param('mid') mid:string){return {data:await this.service.milestone(id,mid,r.identity)};}
 @Post('pacts/:id/transition') async transition(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){return {data:await this.service.transition(id,r.identity,body)};}
 @Get('activity') async activity(@Req() r:AuthRequest){return {data:await this.service.activity(r.identity)};}
}
