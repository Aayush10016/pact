import { Inject, Injectable, Module, ForbiddenException, ServiceUnavailableException, Controller, Get, Req, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createRemoteJWKSet,jwtVerify,type JWTPayload } from 'jose';
import { z } from 'zod';
import type { Request } from 'express';
import { Database } from '../database/database.module';
export interface Identity{id:string;subject:string;email:string;name:string;}
export interface AuthRequest extends Request {identity:Identity;}
export async function verifySession(token:string,keys:Parameters<typeof jwtVerify>[1],issuer:string,origin:string):Promise<JWTPayload>{let payload:JWTPayload;try{({payload}=await jwtVerify(token,keys,{issuer,algorithms:['RS256'],requiredClaims:['sub','exp','nbf','sid','azp'],clockTolerance:5}));}catch{throw new ForbiddenException('Session could not be verified.');}if(payload.azp!==origin||typeof payload.sid!=='string'||typeof payload.sub!=='string'||payload.sts==='pending')throw new ForbiddenException('Session is not authorized for this application.');return payload;}
export const clerkUserSchema=z.object({first_name:z.string().nullable(),last_name:z.string().nullable(),primary_email_address_id:z.string(),email_addresses:z.array(z.object({id:z.string(),email_address:z.email(),verification:z.object({status:z.string()})}))});
@Injectable()
export class IdentityVerifier {
 private keys?:ReturnType<typeof createRemoteJWKSet>;
 async verify(token:string):Promise<{subject:string;email:string;name:string}>{
 const issuer=process.env.CLERK_ISSUER;const secret=process.env.CLERK_SECRET_KEY;
 if(!issuer||!secret)throw new ServiceUnavailableException('Identity is not configured.');
 if(!/^https:\/\/[^/]+$/.test(issuer))throw new ServiceUnavailableException();
 this.keys??=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`),{timeoutDuration:5000});
 const payload=await verifySession(token,this.keys,issuer,process.env.WEB_ORIGIN??'');
 const response=await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(payload.sub!)}`,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(5000)}).catch(()=>{throw new ServiceUnavailableException();});
 if(!response.ok)throw new ServiceUnavailableException();
 const profile=clerkUserSchema.parse(await response.json());const email=profile.email_addresses.find(e=>e.id===profile.primary_email_address_id&&e.verification.status==='verified');
 if(!email)throw new ForbiddenException('Verify your primary email before using Pact.');
 return {subject:payload.sub!,email:email.email_address.toLowerCase(),name:[profile.first_name,profile.last_name].filter(Boolean).join(' ')||'Pact member'};
 }
}
@Injectable()
export class AuthenticationGuard implements CanActivate {
 constructor(@Inject(IdentityVerifier) private readonly verifier:IdentityVerifier,@Inject(Database) private readonly db:Database){}
 async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<AuthRequest>();const auth=request.headers.authorization;if(!auth?.startsWith('Bearer ')||auth.length>8192||auth.split('.').length!==3)throw new ForbiddenException('A verified session is required.');const identity=await this.verifier.verify(auth.slice(7));const result=await this.db.query('INSERT INTO users(auth_subject,email,display_name) VALUES($1,$2,$3) ON CONFLICT(auth_subject) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name RETURNING id',[identity.subject,identity.email,identity.name]);request.identity={id:result.rows[0]!.id,...identity};return true;}
}
@Controller('v1/me') @UseGuards(AuthenticationGuard)
class IdentityController{
 constructor(@Inject(Database) private readonly db:Database){}
 @Get() async me(@Req() req:AuthRequest){return {data:req.identity};}
 @Get('invitations') async invitations(@Req() req:AuthRequest){return {data:(await this.db.query('SELECT i.id,i.pact_id,p.title FROM pact_invitations i JOIN pacts p ON p.id=i.pact_id WHERE lower(i.email)=$1 AND i.accepted_at IS NULL AND p.status=\'CREATED\'',[req.identity.email])).rows};}
}
@Module({providers:[IdentityVerifier,AuthenticationGuard],controllers:[IdentityController],exports:[AuthenticationGuard,IdentityVerifier]}) export class AuthModule{}
